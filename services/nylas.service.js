const request = require('request-promise-native');

const nylasUrl = require('../configs').services.nylas.host;
const certificateAuthority = require('../certificateAuthority');



const Nylas = {};

Nylas.sendMessage = (message, user) => {
  const messageParams = {
    subject: message.subject,
    reply_to_message: message.reply_to_message,
    from: message.from,
    reply_to: message.reply_to,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    body: message.body,
    file_ids: message.file_ids,
    thread_id: message.thread_id,
  };

  const requestParams = {
    url: nylasUrl + '/send',
    body: messageParams,
    auth: {
      user: user.id,
      pass: '',
    },
    json: true,
    ca: certificateAuthority.nylas,
  };

  return request
    .post(requestParams)
    .then(message => {
      return Promise.resolve(message);
    })
    .catch(error => {
      console.error(error);
      return Promise.reject(error);
    });
};

Nylas.deleteAccount = (accountId) => {
  if (!accountId) {
    return Promise.reject();
  }

  const requestParams = {
    url: nylasUrl + '/account',
    auth: {
      user: accountId,
      pass: '',
    },
    json: true,
    ca: certificateAuthority.nylas,
  };

  return request
    .delete(requestParams)
    .then(result=> {
      return Promise.resolve(result);
    })
    .catch(error => {
      console.error(error);
      return Promise.reject(error);
    });
};

module.exports = Nylas;
