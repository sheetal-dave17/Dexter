const _ = require('lodash');
const request = require('request-promise-native');

const certificateAuthority = require('../../certificateAuthority');
const config = require('../../configs/index');
const coreResponse = require('../../core/response');
const errorMessages = require('../../core/errors');

const controllers = {};


const applicationFolders = [
  {
    name: "starred",
    display_name: "Starred",
    query: {starred: true},
    url: config.services.orchestraTopics.host + '/api/message/star/count',
    ca: certificateAuthority.orchestraTopics,
  }
];


const getRequestOptions = (inboxAccountId, folderId = null) => {
  return {
    url: config.services.nylas.host + '/labels/' + (folderId || ''),
    auth: {
      user: inboxAccountId,
      pass: '',
      sendImmediately: false,
    },
    json: true,
    ca: certificateAuthority.nylas,
  }
};


controllers.getFolders = (req, res) => {
  if (!req.user.inbox_account_id) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  const requestOptions = getRequestOptions(req.user.inbox_account_id);

  request.get(requestOptions)
    .then(response => {
      let unreads_promises = [];
      const icons = {
        default: 'folder',
        inbox: 'inbox',
        starred: 'star-o',
        important: 'tag',
        draft: 'file-text-o',
        drafts: 'file-text-o',
        sent: 'paper-plane-o',
        junk: 'exclamation-triangle',
        spam: 'exclamation-triangle',
        trash: 'trash'
      };

      let params = {account_id: req.user.inbox_account_id};
      if (req.query.folder) {
        params['folder'] = req.query.folder;
      }
      unreads_promises.push(request.get({
        url: config.services.orchestraTopics.host + "/api/folders/counts",
        qs: params,
        json: true,
        ca: certificateAuthority.orchestraTopics,
      })
        .then(data => {
          let formattedDefaultFolder = [];
          response.forEach(folder => {
            let count = _.find(data, {name: folder.name}) || null;
            let formattedFolder = {
              folder_id: folder.id,
              id: folder.name || folder.id,
              name: folder.display_name,
              totalMails: count && count.count || 0,
              unreadMails: count && count.unread_count || 0,
              icon: icons[folder.name] || icons['default'],
              sub_folders: []
            };
            formattedDefaultFolder.push(formattedFolder);
          });
          return Promise.resolve(formattedDefaultFolder);
        }));
      applicationFolders.forEach(folder => {
        unreads_promises.push(request.get({
          url: folder.url,
          qs: {account_id: req.user.inbox_account_id},
          json: true,
          ca: folder.ca,
        })
          .then(response => {
            let formattedFolder = {
              folder_id: folder.id,
              id: folder.name || folder.id,
              name: folder.display_name,
              totalMails: response.count,
              unreadMails: response.unread_count,
              icon: icons[folder.name] || icons['default'],
              sub_folders: [],
            }
            return Promise.resolve([formattedFolder]);
          }))
      });

      Promise.all(unreads_promises).then(folderList => {
        let folders = _.flatten((folderList));
        let result = [];

        const processSubfolders = (folders, folder, names) => {
          if (!names || names.length === 0) {
            return folders;
          }

          let parentFolderIndex = _.findIndex(folders, {name: names[0]});

          if (parentFolderIndex === -1 && names.length === 1) {
            // No further subfolders and current folder is not exists
            folder.name = names[0];
            folders.push(folder);
          } else if (parentFolderIndex === -1 && names.length > 1) {
            // Parent folder is not exists, but there is further nesting
            folders = processSubfolders(
              folders,
              folder,
              [names[0] + '/' + names[1], ...names.slice(2)]
            );
          } else {
            // Parent folder found
            folders[parentFolderIndex]['totalMails'] += folder.totalMails;
            folders[parentFolderIndex]['unreadMails'] += folder.unreadMails;
            folders[parentFolderIndex]['sub_folders'] = processSubfolders(
              folders[parentFolderIndex]['sub_folders'],
              folder,
              names.slice(1)
            );
          }
          return folders;
        };

        folders = _.orderBy(folders, 'name');
        folders.forEach(folder => {
          result = processSubfolders(result, folder, folder.name.split('/'));
        });

        const stickedFolders = ['inbox', 'all', 'drafts', 'starred', 'important', 'sent', 'spam', 'trash', 'archive'];

        result.sort((item1, item2) => {
          let index1 = stickedFolders.indexOf(item1.id);
          let index2 = stickedFolders.indexOf(item2.id);
          index1 = index1 !== -1 ? index1 : stickedFolders.length;
          index2 = index2 !== -1 ? index2 : stickedFolders.length;
          if (index1 > index2) {
            return 1;
          }
          if (index1 < index2) {
            return -1;
          }
          return 0;
        });

        res.json(result);
      })
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    })
};


controllers.createFolder = (req, res) => {
  if (!req.user.inbox_account_id) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  if (!req.body.display_name) {
    return coreResponse.sendError(res, errorMessages.FOLDER_NAME_IS_REQUIRED, 400);
  }

  const requestOptions = getRequestOptions(req.user.inbox_account_id);
  requestOptions.body = {
    display_name: req.body.display_name
  };

  request.post(requestOptions)
    .then(data => {
      return coreResponse.sendSuccess(res, {
        id: data.id,
        display_name: data.display_name,
      });
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
};


controllers.renameFolder = (req, res) => {
  if (!req.user.inbox_account_id) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  if (!req.body.display_name) {
    return coreResponse.sendError(res, errorMessages.FOLDER_NAME_IS_REQUIRED, 400);
  }

  const requestOptions = getRequestOptions(req.user.inbox_account_id, req.params.id);
  requestOptions.body = {
    display_name: req.body.display_name
  };

  request.put(requestOptions)
    .then(data => {
      return coreResponse.sendSuccess(res, {
        id: data.id,
        display_name: data.display_name,
      });
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
};


controllers.deleteFolder = (req, res) => {
  if (!req.user.inbox_account_id) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  const requestOptions = getRequestOptions(req.user.inbox_account_id, req.params.id);

  request.delete(requestOptions)
    .then(data => {
      return coreResponse.sendSuccess(res, {});
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
};


module.exports = controllers;
