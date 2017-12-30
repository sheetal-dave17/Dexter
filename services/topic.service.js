const request = require('request-promise-native');
const config = require('../configs');

const certificateAuthority = require('../certificateAuthority');


exports.getContactsFromTopic = function (topic, numberOfRecords, startIndex, account_id) {
  return request
    .get({
      url: config.services.orchestraTopics.host + '/api/topics/' + topic + '/contacts',
      qs: {
        limit: numberOfRecords,
        offset: startIndex,
        account_id: account_id
      },
      json: true,
      ca: certificateAuthority.orchestraTopics,
    });
};
