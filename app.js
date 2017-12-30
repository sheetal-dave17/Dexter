// External dependencies imports
const express = require('express')
const express_jwt = require('express-jwt');
const jwt = require('jsonwebtoken');
const cors = require('cors')
const bodyParser = require('body-parser')
const request = require('request-promise-native');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const _ = require('lodash');
const multipart = require('connect-multiparty');
const multipartMiddleware = multipart();

const ObjectId = require('mongodb').ObjectID;

// Internal dependencies imports
const certificateAuthority = require('./certificateAuthority');
const config = require('./configs');
const accountService = require('./services/account.service');
const agendaService = require('./services/agenda.service');
const contactsService = require('./services/contacts.service');
const nylasService = require('./services/nylas.service');
const topicService = require('./services/topic.service');
const coreResponse = require('./core/response');


const routes = {
  accountMailRules: require('./app/account/settings-mail-rules'),
  accountCancel: require('./app/account/cancel'),
  folders: require('./app/folders/routes'),
  knowledgeGraph: require('./app/knowledge-graph/routes'),
};


const FILE_SIZE_LIMIT = 26214400; // 25 MB


// App creation and middleware applying
const app = express();

const applicationFolders = [
  {
    name: "starred",
    display_name: "Starred",
    query: {starred: true},
  }
];

const moveMessages = (id,account_id, lables) => {
  return request
    .put({
      url: config.services.nylas.host + '/messages/' + id,
      body: {label_ids: lables},
      auth: {
        'user': account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true,
      ca: certificateAuthority.nylas,
    })
}

const getMessage = (id,account_id) => {
  return request
    .get({
      url: config.services.orchestraTopics.host + '/api/messages/' + id,
      qs: {account_id: account_id},
      auth: {
        'user': account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
}

const checkAccountReady = (accountId) => {
  // Check default folders are synced
  return request.get({
    url: config.services.nylas.host + '/labels/',
    auth: {
      user: accountId,
      pass: '',
    },
    json: true,
    ca: certificateAuthority.nylas,
  })
  .then(response => {
    const defaultFolders = [
      {name: 'inbox'},
      {name: 'all'},
      {name: 'trash'},
      {name: 'sent'},
      {name: 'spam'},
    ];

    return Promise.resolve(response.length >= 2);
  })
  .then(accountReady => {
    if (!accountReady) {
      return Promise.resolve(false);
    }

    // Check at least some messages processed
    return request
      .get({
        url: config.services.orchestraTopics.host + '/api/messages',
        qs: {
          account_id: accountId,
          limit: 1
        },
        json: true,
        ca: certificateAuthority.orchestraTopics,
      })
      .then(response => {
        return Promise.resolve(response.messages.length > 0);
      })
  })
}


app.use(cookieParser())
app.use(express_jwt({
  secret: config.authSecret,
  getToken: req => {
    if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
      return req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      return req.cookies.token;
    }
    return null;
  }
}).unless({path: ['/api/auth/login', '/api/auth/google', '/healthcheck']}));
app.use(function (err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    res.status(401).json({success: false, error: 'invalid token'});
  }
});
app.use(cors({
  credentials: true,
  origin: config.allowedOrigins,
}))
app.use(bodyParser.json())





app.get('/api/mail/folders', routes.folders.getFolders);
app.post('/api/mail/folders', routes.folders.createFolder);
app.put('/api/mail/folders/:id', routes.folders.renameFolder);
app.delete('/api/mail/folders/:id', routes.folders.deleteFolder);

app.get('/api/knowledge-graph', routes.knowledgeGraph.getRelatedInfo);
app.get('/api/knowledge-graph/topics', routes.knowledgeGraph.getRelatedTopics);
app.get('/api/knowledge-graph/connections', routes.knowledgeGraph.getRelatedConnections);
app.get('/api/knowledge-graph/messages', routes.knowledgeGraph.getRelatedMessages);
app.get('/api/knowledge-graph/files/:type', routes.knowledgeGraph.getRelatedFiles);

app.delete('/api/account', routes.accountCancel.delete);

app.get('/api/account/mail-rules', routes.accountMailRules.get);
app.post('/api/account/mail-rules', routes.accountMailRules.post);
app.put('/api/account/mail-rules/:id', routes.accountMailRules.put);
app.delete('/api/account/mail-rules/:id', routes.accountMailRules.delete);


app.get('/healthcheck', function (req, res) {
  res.send('OK');
})

// Endpoints definitions
app.post('/api/auth/login', function (req, res) {
  if (!req.body.username || !req.body.password) {
    res.status(400).json({success: false, error: 'username and password required'})
    return;
  }

  if (req.body.username !== 'testuser' || req.body.password !== '123123') {
    res.status(401).json({success: false, error: 'invalid credentials'})
    return;
  }

  res.status(200).json({success: true, token: jwt.sign({id: 1, username: req.body.login}, SECRET)})
})

app.post('/api/auth/google', (req, res) => {
  if (!req.body.code || !req.body.redirect_uri) {
    return res.status(400).json({success: false, error: 'Google Token and redirect uri are required'});
  }

  request
    .get({
      url: config.services.nylas.host + '/auth/gmail/register',
      qs: {authcode: req.body.code, redirecturi: req.body.redirect_uri},
      json: true,
      ca: certificateAuthority.nylas,
    })
    .then(body => {
      if (body.code === "email_not_allowed") {
        return accountService.saveToWaitingList(body.profile)
          .then(() => res.status(403).json({success: false, error_code: "email_not_allowed", error: "Email is not allowed"}))
      } else if (!body.api_id) {
        return res.status(500).json({success: false, error: "Account can't be found"})
      }

      const token = jwt.sign({id: 1, inbox_account_id: body.api_id}, config.authSecret);

      if(body.code === 'account_created') {
        return res.status(200).cookie('token', token).json({success: true, token: token, account_ready: false});
      }

      checkAccountReady(body.api_id)
        .then(accountReady => res.status(200).cookie('token', token).json({success: true, token: token, account_ready: accountReady}))
        .catch(error => {
          console.error(error);
          res.status(500).json({success: false, error: error})
        })
    })
    .catch(error => {
      console.error(error);
      return res.status(400).json({success: false, error: error.error.message});
    })
})

app.get('/api/auth/logout', function (req, res) {
  req.cookies.token = '';
  res.status(200).clearCookie('token').json({ success: true });
})

app.get('/api/account', function (req, res) {
  if (!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'no inbox account'})
    return false;
  }

  request
    .get({
      url: config.services.nylas.host + '/account/',
      auth: {
        'user': req.user.inbox_account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true,
      ca: certificateAuthority.nylas,
    })
    .then(response => {
      res.json({
        id: response.id,
        name: response.name,
        email: response.email_address,
        provider: response.provider,
        status: response.sync_state
      })
    })
    .catch(error => {
      console.log(error);
      res.status(500).json({success: false, error: error})
    })
})

app.get('/api/account/ready', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'})
  }

  checkAccountReady(req.user.inbox_account_id)
    .then(accountReady => res.status(200).json({success: true, account_ready: accountReady}))
    .catch(error => {
      console.error(error);
      return res.status(500).json({success: false, error: error})
    })
})

app.get('/api/account/signatures', (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'no inbox account'})
    return false;
  }

  request
    .get({
      url: config.services.orchestraAccounts.host + '/api/account/signatures',
      qs: { account_id: req.user.inbox_account_id },
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(response => {
      res.json({ success: true, signatures: response.signatures })
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ success: false, error: err })
    });
})

app.post('/api/account/signatures', (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'no inbox account'})
    return false;
  }

  if (!req.body.signature) {
    res.status(400).json({success: false, error: 'no signature provided'})
    return false;
  }

  request
    .post({
      url: config.services.orchestraAccounts.host + '/api/account/signatures',
      qs: { account_id: req.user.inbox_account_id },
      body: { title: req.body.signature.title, content: req.body.signature.content },
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(response => {
      res.json({ success: true, data: response.data })
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ success: false, error: err })
    });
})

app.put('/api/account/signatures/:id', (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({ success: false, error: 'no inbox account' })
    return false;
  }

  if (!req.body.signature) {
    res.status(400).json({ success: false, error: 'no signature provided' })
    return false;
  }

  const body = {
    title: req.body.signature.title,
    content: req.body.signature.content,
    isDefault: !!req.body.signature.isDefault,
    id: req.params.id
  };

  request
    .put({
      url: config.services.orchestraAccounts.host + '/api/account/signatures/' + body.id,
      qs: { account_id: req.user.inbox_account_id },
      body: body,
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(response => {
      res.json({ success: true, data: response.data })
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ success: false, error: err })
    });
});

app.delete('/api/account/signatures/:id', (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({ success: false, error: 'no inbox account' })
    return false;
  }

  request
    .delete({
      url: config.services.orchestraAccounts.host + '/api/account/signatures/' + req.params.id,
      qs: { account_id: req.user.inbox_account_id },
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(response => {
      res.json({ success: true })
    })
    .catch(err => {
      console.log(err);
      res.status(500).json({ success: false, error: err })
    });
})

app.get('/api/account/auto-reply', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  request
    .get({
      url: config.services.orchestraAccounts.host + '/api/account/auto-reply',
      qs: {account_id: req.user.inbox_account_id},
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(response => {
      return res.json({ success: true, autoReply: response.autoReply });
    })
    .catch(error => {
      console.log(error);
      return res.status(500).json({ success: false, error: error });
    });
});

app.post('/api/account/auto-reply', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  const autoReply = {
    dateFrom: req.body.dateFrom,
    dateTo: req.body.dateTo,
    content: req.body.content,
    enabled: req.body.enabled,
  };

  if (!autoReply.dateFrom) {
    return res.status(400).json({success: false, error: 'dateFrom is missed'});
  }

  if (!autoReply.dateTo) {
    return res.status(400).json({success: false, error: 'dateTo is missed'});
  }

  if (!autoReply.content) {
    return res.status(400).json({success: false, error: 'content is missed'});
  }

  request
    .post({
      url: config.services.orchestraAccounts.host + '/api/account/auto-reply',
      qs: {account_id: req.user.inbox_account_id},
      body: autoReply,
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(() => {
      return res.json({ success: true });
    })
    .catch(error => {
      console.log(error);
      return res.status(500).json({ success: false, error: error });
    });
});

app.get('/api/account/delayed-send', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  return accountService.getDelayedSend(req.user.inbox_account_id)
    .then(result => {
      return res.json({ success: true, enabled: result });
    })
    .catch(error => {
      return res.status(500).json({ success: false, error: error });
    });
});

app.post('/api/account/delayed-send', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  request
    .post({
      url: config.services.orchestraAccounts.host + '/api/account/delayed-send',
      qs: {account_id: req.user.inbox_account_id},
      body: {enabled: req.body.enabled},
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(() => {
      res.json({ success: true });
    })
    .catch(error => {
      console.error(error);
      res.status(500).json({ success: false, error: error });
    });
});

app.get('/api/account/quick-reply-templates', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  request
    .get({
      url: config.services.orchestraAccounts.host + '/api/account/quick-reply-templates',
      qs: {account_id: req.user.inbox_account_id},
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(response => {
      return res.json({ success: true, quickReplyTemplates: response.data })
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({ success: false, error: error });
    });
});

app.post('/api/account/quick-reply-templates', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  if (!req.body.content) {
    return res.status(400).json({success: false, error: 'empty content'})
  }

  if (!req.body.title) {
    return res.status(400).json({success: false, error: 'empty title'})
  }

  request
    .post({
      url: config.services.orchestraAccounts.host + '/api/account/quick-reply-templates',
      qs: {account_id: req.user.inbox_account_id},
      body: {
        content: req.body.content,
        title: req.body.title,
      },
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(() => {
      return res.json({ success: true, data: {} });
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({ success: false, error: error });
    });
});

app.put('/api/account/quick-reply-templates/:id', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  if (!req.body.content) {
    return res.status(400).json({success: false, error: 'empty content'})
  }

  if (!req.body.title) {
    return res.status(400).json({success: false, error: 'empty title'})
  }

  request
    .put({
      url: config.services.orchestraAccounts.host + `/api/account/quick-reply-templates/${req.params.id}`,
      qs: {account_id: req.user.inbox_account_id},
      body: {
        content: req.body.content,
        title: req.body.title,
      },
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(() => {
      return res.json({ success: true, data: {} });
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({ success: false, error: error });
    });
});

app.delete('/api/account/quick-reply-templates/:id', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  request
    .delete({
      url: config.services.orchestraAccounts.host + `/api/account/quick-reply-templates/${req.params.id}`,
      qs: {account_id: req.user.inbox_account_id},
      json: true,
      ca: certificateAuthority.orchestraAccounts,
    })
    .then(() => {
      return res.json({ success: true, data: {} });
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({ success: false, error: error });
    });
});

app.get('/api/mail/drafts', (req, res) => {
  request
    .get({
      url: config.services.nylas.host + '/drafts',
      body: {},
      auth: {
        'user': req.user.inbox_account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true,
      ca: certificateAuthority.nylas,
    })
    .then(data => res.json({success: true, data:data}))
    .catch(error => res.json({success: false, error: error}))
})

app.get('/api/mail/files/:id', (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'no inbox account'})
    return false;
  }

  request
    .get({
      url: config.services.nylas.host + '/files/' + req.params.id + '/download',
      auth: {
        'user': req.user.inbox_account_id,
        'pass': '',
        'sendImmediately': false,
      },
      ca: certificateAuthority.nylas,
    }).pipe(res);
})

app.post('/api/mail/files', multipartMiddleware, (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'no inbox account'})
    return false;
  }

  if (!req.files || !req.files.file) {
    res.status(400).json({success: false, error: 'Field file is required'})
    return false;
  }

  const errorAttachmentTooLarge = {
    success: false,
    error: 'attachment too large'
  };

  if (req.files.file.size >= FILE_SIZE_LIMIT) {
    return res.status(413).json(errorAttachmentTooLarge);
  }

  const data = {
    file: {
      value: fs.createReadStream(req.files.file.path),
      options: {
        filename: req.files.file.originalFilename,
      }
    }
  }

  request
    .post({
      url: config.services.nylas.host + '/files',
      auth: {
        'user': req.user.inbox_account_id,
        'pass': ''
      },
      formData: data,
      json: true,
      ca: certificateAuthority.nylas,
    })
    .then(response => {
      if(!response[0] || !response[0].id) {
        console.log("error response:", response);
        return res.json({success: false});
      }
      return res.json({success: true, file_id: response[0].id});
    })
    .catch(err => {
      const errorMessage = {
        success: false,
        error: 'attachment_error'
      };

      if (err && err.statusCode === 413) {
        return res.status(413).json(errorAttachmentTooLarge);
      }

      console.error(err);
      return res.status(400).json(errorMessage);
    });
})

app.put('/api/mail/messages/read', (req, res) => {
  if (!req.body.message_id) {
    res.status(400).json({success: false, error: 'message_id is not specified'})
    return;
  }

  request
    .put({
      url: config.services.nylas.host + '/messages/' + req.body.message_id,
      body: {unread: req.body.unread || false},
      auth: {
        'user': req.user.inbox_account_id,
        'pass': '',
        'sendImmediately': false,
      },
      json: true,
      ca: certificateAuthority.nylas,
    })
    .then(() => res.json({success: true}))
    .catch(() => res.json({success: false}))
});

app.put('/api/mail/messages/star', (req, res) => {
  if (!req.body.message_id) {
    res.status(400).json({success: false, error: 'message_id is not specified'})
    return;
  }

  request
    .put({
      url: config.services.nylas.host + '/messages/' + req.body.message_id,
      body: {starred: req.body.starred},
      auth: {
        'user': req.user.inbox_account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true,
      ca: certificateAuthority.nylas,
    })
    .then(() => res.json({success: true}))
    .catch(() => res.json({success: false}))
});

app.get('/api/contacts/:email', (req, res) => {
  const limits = {
    images: req.query.images || 9,
    docs: req.query.docs || 6,
    videos: req.query.videos || 2,
    connections: req.query.connections || 7,
    topics: req.query.topics || 6,
    events: req.query.events || 4
  };

  let promises = [];

  // Getting data:
  // Files (Images, Videos, Docs), !Events!, Connections, Topics

  promises.push(contactsService.getFiles(req.user.inbox_account_id, req.params.email, 'images', 0, limits.images ));
  promises.push(contactsService.getFiles(req.user.inbox_account_id, req.params.email, 'videos', 0, limits.videos ));
  promises.push(contactsService.getFiles(req.user.inbox_account_id, req.params.email, 'docs', 0, limits.docs ));
  promises.push(contactsService.getConnections(req.user.inbox_account_id, req.params.email, 0, limits.connections ));
  promises.push(contactsService.getTopics(req.user.inbox_account_id, req.params.email, 0, limits.topics ));

  Promise.all(promises)
    .then(data => {
      let contactData = {
        mobile: '',
        address: '',
        profileUrl: '',
        totals: {
          events: 0,
          images: data[0].total,
          videos: data[1].total,
          docs: data[2].total,
          connections: data[3].total,
          topics: data[4].total
        },
        events: [],
        files: {
          images: data[0].files.map(coreResponse.formatFile),
          videos: data[1].files.map(coreResponse.formatFile),
          docs: data[2].files.map(coreResponse.formatFile),
        },
        connections: data[3].connections,
        topics: data[4].topics
      };
      res.status(200).json({success: true, contact: contactData});
    });
});

app.get('/api/contacts/:email/files/:type', (req, res) => {
  contactsService.getFiles(
    req.user.inbox_account_id,
    req.params.email,
    req.params.type,
    req.query.offset || 0,
    req.query.limit || 20
  )
  .then(data => {
    res.json({success: true, data: data.files})
  })
  .catch(err => {
    console.log(err);
    res.status(500).json({success: false, err: err})
  })
});

app.get('/api/contacts/:email/connections', (req, res) => {
  contactsService.getConnections(
    req.user.inbox_account_id,
    req.params.email,
    req.query.offset || 0,
    req.query.limit || 20
  )
  .then(data => {
    res.json({success: true, data: data.connections})
  })
  .catch(err => {
    console.log(err);
    res.status(500).json({success: false, err: err})
  })
});

app.get('/api/contacts/:email/topics', (req, res) => {
  contactsService.getTopics(
    req.user.inbox_account_id,
    req.params.email,
    req.query.offset || 0,
    req.query.limit || 20
  )
  .then(data => {
    res.json({success: true, data: data.topics})
  })
  .catch(err => {
    console.log(err);
    res.status(500).json({success: false, err: err})
  })
});

app.get('/api/contacts', (req, res) => {

  let params = {
    limit: req.query.limit,
    offset: req.query.offset || 0,
  };

  if(req.query.filter){
    params['filter'] = req.query.filter;
  }
  let contact = {
    contacts: [],
    total_count: 0
  }

  let api_promises = [];

  api_promises.push(
    request
      .get({
        url: config.services.nylas.host + '/contacts',
        qs: params,
        body: {},
        auth: {
          'user': req.user.inbox_account_id,
          'pass': '',
          'sendImmediately': false
        },
        json: true,
        ca: certificateAuthority.nylas,
      })
      .then(response => {
        contact.contacts = response
        return Promise.resolve(true);
      })
  )

  params['view'] = 'count';

  api_promises.push(
    request
      .get({
        url: config.services.nylas.host + '/contacts',
        qs: params,
        body: {},
        auth: {
          'user': req.user.inbox_account_id,
          'pass': '',
          'sendImmediately': false
        },
        json: true,
        ca: certificateAuthority.nylas,
      })
      .then(response => {
        contact.total_count = response.count
        return Promise.resolve(true);
      })
  )

  Promise.all(api_promises)
    .then(() => res.json(contact))
    .catch(error => {
      console.log(error);
      res.status(500).json({success: false, error: error})
    });
});

app.delete('/api/mail/messages/delayed/:id', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  const conditions = {
    name: agendaService.job_names.MAIL_SEND_DELAYED,
    _id: ObjectId(req.params.id),
  };

  agendaService.cancelJobs(conditions)
    .then(data => {
      return res.json({success: true, data: data});
    })
    .catch(error => {
      console.error(error);
      return res.status(500).json({success: false, error: 'cancellation failed'});
    });
});

app.post('/api/mail/messages/snooze', (req, res) => {
  const userId = req.user.inbox_account_id;
  const messageId = req.body.id;

  if (!userId) {
    return res.status(400).json({success: false, error: 'account_id is missed'});
  }

  if (!messageId) {
    return res.status(400).json({success: false, error: 'message id is missed'});
  }

  const snoozeParams = [
    messageId, userId, config.snoozeMessageSchedule
  ];

  return agendaService.jobs.createSnooze(...snoozeParams, (error, data) => {
    if (error) {
      return res.status(500).json({success: false, error: error});
    }

    return res.json({success: true, data: data});
  });
});

app.post('/api/mail/messages/send', (req, res) => {
  const accountId = req.user.inbox_account_id;

  const followUpEmailTimestamp = req.body.message.follow_up || null;

  const messageParams = {
    subject: req.body.message.subject,
    reply_to_message_id: req.body.message.reply_to_message_id,
    from: req.body.message.from,
    reply_to: req.body.message.reply_to || [],
    to: req.body.message.to,
    cc: req.body.message.cc,
    bcc: req.body.message.bcc,
    body: req.body.message.body,
    file_ids: req.body.message.file_ids || [],
    thread_id: req.body.message.thread_id,
  };
  const userParams = { id: accountId };

  return accountService.getDelayedSend(accountId)
    .then(delayedSendEnabled => {

      if (delayedSendEnabled) {
        const delaySendParams = [
          messageParams, userParams, config.delayedSendSchedule, {followUpEmailTimestamp}
        ];

        return agendaService.jobs.createDelayedSend(...delaySendParams, (error, data) => {
          if (error) {
            console.error(error);
            return res.status(400).json({success: false, error: 'delayed send job not saved'});
          }

          const result = {
            message: messageParams,
            delay_send_job_id: data.attrs._id,
          };

          return res.status(200).json({success: true, data: result});
        });
      }

      return nylasService.sendMessage(messageParams, userParams)
        .then(sentMessage => {
          let body = {};
          if(req.body.message.replied || req.body.message.forwarded) {
            if (req.body.message.replied) {
              body['replied'] = req.body.message.replied;
            }
            if (req.body.message.forwarded) {
              body['forwarded'] = req.body.message.forwarded;
            }
            request
              .put({
                url: config.services.orchestraTopics.host + '/api/messages/' + req.body.message.reply_to_message_id,
                body: body,
                qs: {
                  account_id: req.user.inbox_account_id,
                },
                json: true,
                ca: certificateAuthority.orchestraTopics,
              });
          }
          const scheduleEmailFollowUp =
               followUpEmailTimestamp
            && followUpEmailTimestamp > Date.now()
            && sentMessage.id;

          if (scheduleEmailFollowUp) {
            const snoozeParams = [
              sentMessage.id, accountId, followUpEmailTimestamp
            ];

            return agendaService.jobs.createSnooze(...snoozeParams, (error, data) => {
              if (error) {
                return res.status(500).json({success: false, error: error});
              }

              return res.json({success: true, data: sentMessage});
            });
          }

          return res.json({success: true, data: sentMessage});
        })
        .catch(error => {
          return res.status(500).json({success: false, error: error});
        });

    })
    .catch(error => {
      return res.status(500).json({success: false, error: error});
    });
});

app.post('/api/mail/messages/drafts', (req, res) => {

  request
    .post({
      url: config.services.nylas.host + '/drafts',
      body: {
        subject: req.body.message.subject,
        from: req.body.message.from,
        reply_to: req.body.message.reply_to ? req.body.message.reply_to : [],
        to: req.body.message.to,
        cc: req.body.message.cc,
        bcc: req.body.message.bcc,
        body: req.body.message.body,
        file_ids: req.body.message.file_ids ? req.body.message.file_ids : []
      },
      auth: {
        'user': req.user.inbox_account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true,
      ca: certificateAuthority.nylas,
    })
    .then(data => res.json({success: true, data:data}))
    .catch(error => res.json({success: false, error: error}))
})

app.get('/api/mail/messages/:id/topics', (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'account_id is undefined'})
    return;
  }

  request
    .get({
      url: config.services.orchestraTopics.host + '/api/messages/' + req.params.id + '/topics',
      qs: {
        account_id: req.user.inbox_account_id,
        force_process: req.query.force_process
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(data => res.json({success: true, data: data.topics}))
    .catch(err => res.status(500).json({success: false, error: err.message}))
});

app.post('/api/mail/messages/:id/topics', (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'account_id is undefined'})
    return;
  }

  if(!req.body.topics || req.body.topics.length === 0) {
    return res.json({success: true});
  }

  request
    .post({
      url: config.services.orchestraTopics.host + '/api/messages/' + req.params.id + '/topics',
      qs: {
        account_id: req.user.inbox_account_id,
      },
      body: req.body,
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(data => res.json({success: data.success}))
    .catch(err => {
      console.error(err);
      return res.status(500).json({success: false, error: err.message});
    })
});


app.get('/api/mail/messages/:id/topics/annotations', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'account_id is undefined'});
  }

  request
    .get({
      url: config.services.orchestraTopics.host + '/api/messages/' + req.params.id + '/topics/annotations',
      qs: {
        account_id: req.user.inbox_account_id,
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(data => res.json({success: true, annotations: data.annotations, shareText: data.shareText}))
    .catch(err => {
      console.error(err);
      return res.status(500).json({success: false, error: err.message});
    })
});

app.post('/api/mail/messages/:id/topics/annotations', (req, res) => {
  if (!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'account_id is undefined'})
  }

  request
    .post({
      url: config.services.orchestraTopics.host + '/api/messages/' + req.params.id + '/topics/annotations',
      qs: {
        account_id: req.user.inbox_account_id,
      },
      body: req.body,
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(data => res.json({success: data.success}))
    .catch(err => {
      console.error(err);
      return res.status(500).json({success: false, error: err.message});
    })
});

app.get('/api/topics', (req, res) => {
  request
    .get({
      url: config.services.orchestraTopics.host + '/api/topics-map',
      qs: {
        account_id: req.user.inbox_account_id,
        limit: 25,
        from_date: req.query.from_date,
        topic: req.query.base_topic,
        email: req.query.email
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(data => res.json({success: true, data: data.topics}))
    .catch(err => res.json({success: false, error: err}))
});

app.get('/api/topics/:topic/similar', (req, res) => {
  request
    .get({
      url: config.services.orchestraTopics.host + '/api/topics-map/',
      qs: {
        account_id: req.user.inbox_account_id,
        topic: req.params.topic,
        limit: 20
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(data => res.json({success: true, data: data.topics.filter((topic) => topic.name !== req.params.topic)}))
    .catch(err => res.json({success: false, error: err}))
});

app.post('/api/mail/search', (req, res) => {
  if(!req.body.query) {
    res.status(400).json({success: false, error: 'no search query'})
    return;
  }
  let api_promises = [];

  request
    .post({
      url: config.services.stitchSearch.host+'/search/messages',
      body: {
        accountId: req.user.inbox_account_id,
        query: req.body.query,
        fields: ['bodyText', 'subject'],
        size: req.body.limit,
        from: req.body.offset
      },
      json: true,
      ca: certificateAuthority.stitchSearch,
    })
    .then(response => {
      response.messages.forEach(message => {
        api_promises.push(
          request
            .get({
              url: config.services.orchestraTopics.host + '/api/messages/' + message.messageId,
              qs: {account_id: req.user.inbox_account_id},
              json: true,
              ca: certificateAuthority.orchestraTopics,
            }).then(msg => {
              msg.message.snippet = message.subjectHighlight || message.bodyTextHighlight || msg.message.snippet;
              return Promise.resolve(msg.message)
            }).catch(err => {
              console.error(err);
              return Promise.resolve(null);
            })
        )
      });

      return Promise.all(api_promises)
        .then(result => {
          return Promise.resolve({messages: result.filter(msg => msg !== null).map(coreResponse.formatMessage), count: response.count});
        })
    })
    .then((searchResults) => res.json({ success: true, data: searchResults }))
    .catch(err => {
      console.error(err);
      res.status(500).json({success: false, error: err})
    })
});

app.post('/api/mail/search/history', (req, res) => {
  request
    .post({
      url: config.services.stitchSearch.host+'/suggest',
      body: { accountId: req.user.inbox_account_id, query: req.body.query },
      json: true,
      ca: certificateAuthority.stitchSearch,
    })
    .then(response => {
      res.json({ success: true, data: response})
    })
    .catch(error => res.json({ success: false, error: error }));
});

app.get('/api/topic/:topic/contacts', (req, res) => {
  const params = {
    topic: req.params.topic,
    noOfRecords: req.query.limit || 10,
    startIndex: req.query.offset || 0,
    account_id: req.user.inbox_account_id
  };

  topicService.getContactsFromTopic(params.topic, params.noOfRecords, params.startIndex, params.account_id)
    .then(data => {
      res.status(200).json(data);
    })
    .catch(err => res.json({success: false, error: err}));
});

app.get('/api/topics/counters/:topic', (req, res) => {
  request
    .get({
      url: config.services.orchestraTopics.host + '/api/counters/' + req.params.topic,
      qs: {
        account_id: req.user.inbox_account_id
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(response => {
      res.json({success: true, data: response.data})
    })
    .catch(err => res.json({success: false, error: err}));
});

app.post('/api/topics/search', (req, res) => {
  let result = [];
  request
    .post({
      url: config.services.stitchSearch.host+'/search/topics',
      body: { accountId: req.user.inbox_account_id, query: req.body.query },
      qs:{},
      json: true,
      ca: certificateAuthority.stitchSearch,
    })
    .then(response => {
      let topic = response[0];
      result.push(topic);
      request
        .get({
          url: config.services.orchestraTopics.host + '/api/topics-map/'+ topic.name +'/similar',
          qs: {
            account_id: req.user.inbox_account_id,
            limit: 24
          },
          json: true,
          ca: certificateAuthority.orchestraTopics,
        })
        .then(data =>{
          result = result.concat(data.topics);
          return res.json({ success: true, data: result})})
        .catch(err => Promise.reject(err))
    })
    .catch(err => res.status(500).json({ sucess:false, error: err}))
})

app.get('/api/mail/messages/:id', (req, res) => {
  if(!req.user.inbox_account_id) {
    return res.status(400).json({success: false, error: 'no inbox account'});
  }

  return getMessage(req.params.id, req.user.inbox_account_id)
    .then(data => {
      return res.json({ success: true, data: coreResponse.formatMessage(data.message) });
    })
    .catch(error => {
      return res.status(500).json({ success: false, error: error });
    });
});

app.get('/api/mail/messages', (req, res) => {
  if(!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'no inbox account'})
    return false;
  }

  let params = {};

  if (req.query.thread_id) {
    params['thread_id'] = req.query.thread_id;
  }

  if (req.query.from) {
    params['from'] = req.query.from;
  }

  if (req.query.email) {
    params['email'] = req.query.email;
  }

  if (req.query.topic) {
    params['topic'] = req.query.topic;
  }

  params.account_id = req.user.inbox_account_id;
  params.limit = req.query.limit || 20;
  params.offset = req.query.offset || 0;
  params.folder = req.query.folder;
  params.order = req.query.sort_by;

  if (req.query.pinned) {
    params['pinned'] = req.query.pinned;
  }

  let folder = _.find(applicationFolders, {name: params.folder})
  if (folder) {
    delete params.folder;
    Object.assign(params, folder.query);
  }
  else {
    params["folder"] = params.folder;
  }

  if (req.query.date_after) {
    params.date_after = req.query.date_after;
  }

  request
    .get({
      url: config.services.orchestraTopics.host + '/api/messages',
      qs: params,
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(response => {
      response.messages = response.messages.map(message => {
        if (req.query.topic) {
          let snippet;
          snippet = message.topics.map(topic => {
            return topic.name
          }).join(', ');
          snippet = snippet.replace(req.query.topic, '<mark>' + req.query.topic + '</mark>');
          message.snippet = snippet;
        }
        return coreResponse.formatMessage(message)
      });
      res.json({success: true, data: response})
    })
    .catch(err => res.status(500).json({success: false, error: err}));
})

app.get('/api/mail/latest-messages', (req, res) => {
  if (!req.user.inbox_account_id) {
    res.status(400).json({success: false, error: 'no inbox account'})
    return false;
  }

  let params = {};

  params.account_id = req.user.inbox_account_id;
  if (req.query.folder) {
    params.folder = req.query.folder;
  }
  params.order = req.query.sort_by;
  if (req.query.date_after) {
    params.date_after = req.query.date_after;
  }
  if (req.query.limit) {
    params.limit = req.query.limit;
  }

  request
    .get({
      url: config.services.orchestraTopics.host + '/api/latest-messages',
      qs: params,
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(messages => {
      res.json({ success: true, data: messages.map(coreResponse.formatMessage)})
    }).catch(err =>  res.status(500).json({ success: false, error: err }));
})

app.put('/api/mail/move-messages/:id', (req, res) => {

  let id = req.params.id;
  let labels = req.body.labels;

  if (!labels) {
    res.status(400).json({success: false, error: 'labels are not specified'})
    return;
  }

  moveMessages(id, req.user.inbox_account_id, [labels])
    .then(() => res.json({success: true}))
    .catch(err => {
      res.status(404).json({success: false, error: err.msg});
    })
});

app.post('/api/mail/messages/:id/labels', (req, res) => {

  let id = req.params.id;
  let label_id = req.body.label_id;

  getMessage(id, req.user.inbox_account_id)
    .then(message => {

      let labels = message.message.labels.map(label => label.id);
      if(labels.includes(label_id)){
        res.status(200).json({success: true});
        return
      }

        labels.push(label_id);
        // Call Nylas

        if (!labels) {
          res.status(400).json({success: false, error: 'labels are not specified'})
          return;
        }

        moveMessages(id, req.user.inbox_account_id, labels)
          .then(() => res.json({success: true}))
          .catch(err => {
            res.status(404).json({success: false, error: err.msg});
          })

    });

});

app.delete('/api/mail/messages/:id/labels/:label_id', (req, res) => {

  let id = req.params.id;
  let label_id = req.params.label_id;

  getMessage(id, req.user.inbox_account_id)
    .then(message => {

      let labels = message.message.labels.map(label => label.id);

      if(!labels.includes(label_id)){
        res.status(200).json({success: true});
        return
      }

      labels.splice(labels.indexOf(label_id), 1);
      // Call Nylas

      if (!labels) {
        res.status(400).json({success: false, error: 'labels are not specified'})
        return;
      }

      moveMessages(id, req.user.inbox_account_id, labels)
        .then(() => res.json({success: true}))
        .catch(err => {
          res.status(404).json({success: false, error: err.msg});
        })
    });
})

app.delete('/api/messages/:id', (req, res) => {

  request
    .delete({
      url: config.services.orchestraTopics.host + '/api/messages/' + req.params.id,
      qs: {account_id: req.user.inbox_account_id},
      auth: {
        'user': req.user.inbox_account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(() => res.json({success: true}))
    .catch(err => {
      res.status(404).json({success: false, error: err.msg});
    })
});

app.put('/api/message/:id/pinned', (req, res) => {
  request
    .put({
      url: config.services.orchestraTopics.host + '/api/message/' +req.params.id + '/pinned',
      qs: {account_id: req.user.inbox_account_id},
      body: {pinned: req.body.pinned},
      auth: {
        'user': req.user.inbox_account_id,
        'pass': '',
        'sendImmediately': false
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(() => res.json({success: true}))
    .catch(err => {
      res.status(404).json({success: false, error: err.msg});
    })
});

app.post('/api/mail/move-messages', (req, res) => {
  if (!req.body.labels) {
    res.status(400).json({ success: false, error: 'labels are not specified' });
    return;
  }

  if (!req.body.messages) {
    res.status(400).json({ success: false, error: 'messages are required' });
    return;
  }

  let messages = req.body.messages;
  let messages_promises = [];

  messages.forEach(messageId => {
    messages_promises.push(
      request
        .put({
          url: config.services.nylas.host + '/messages/' + messageId,
          body: {label_ids: [req.body.labels]},
          auth: {
            'user': req.user.inbox_account_id,
            'pass': '',
            'sendImmediately': false
          },
          json: true,
          ca: certificateAuthority.nylas,
        })
    )
  });

  Promise.all(messages_promises)
    .then(data => res.status(200).json({ success: true, data: data }))
    .catch(err => res.status(400).json({ success: false, error: err }));
})


app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
});

