const request = require('request-promise-native');

const certificateAuthority = require('../certificateAuthority');
const config = require('../configs');


const contactsService = {
  getFiles: (accountId, contactId, type, offset, limit) => {
    return request
      .get({
        url: config.services.orchestraTopics.host + '/api/contacts/' + contactId + '/files/' + type,
        qs: {
          account_id: accountId,
          offset: offset,
          limit: limit,
        },
        json: true,
        ca: certificateAuthority.orchestraTopics,
      })
      .then(data => {
        data.files.forEach(file => {
          file.url = config.host + "/api/mail/files/" + file.id
        });
        return Promise.resolve(data);
      })
  },
  getConnections: (accountId, contactId, offset, limit) => {
    return request
      .get({
        url: config.services.orchestraTopics.host + '/api/contacts/' + contactId + '/connections',
        qs: {
          account_id: accountId,
          offset: offset,
          limit: limit,
        },
        json: true,
        ca: certificateAuthority.orchestraTopics,
      })
  },
  getTopics: (accountId, contactId, offset, limit) => {
    return request
      .get({
        url: config.services.orchestraTopics.host + '/api/contacts/' + contactId + '/topics',
        qs: {
          account_id: accountId,
          offset: offset,
          limit: limit,
        },
        json: true,
        ca: certificateAuthority.orchestraTopics,
      })
  },
}

module.exports = contactsService;
