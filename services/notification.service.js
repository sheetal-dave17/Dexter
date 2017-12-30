const request = require('request-promise-native');

const certificateAuthority = require('../certificateAuthority');
const config = require('../configs');

const URL = config.services.notifications.host;
const URL_SNOOZE = `${URL}/api/mail/messages/snooze`;

const notificationService = {};

notificationService.snoozeEmail = (account_id, message_id) => {
  const params = {
    url: URL_SNOOZE,
    qs: {
      account_id,
    },
    body: {
      id: message_id,
    },
    json: true,
    ca: certificateAuthority.orchestraNotifications,
  };

  return request.post(params)
    .then(data => {
      return Promise.resolve(data);
    })
    .catch(error => {
      console.error(error);
      return Promise.reject(error);
    });
};

module.exports = notificationService;
