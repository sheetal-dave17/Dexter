const request = require('request-promise-native');

const basicOrchestraService = require('./orchestra.service');

const accountService = {};

accountService.getDelayedSend = (account_id) => {
  return basicOrchestraService.get('orchestraAccounts', {
    url: '/api/account/delayed-send',
    qs: { account_id },
  })
    .then(response => {
      return Promise.resolve(response.enabled);
    })
    .catch(error => {
      console.error(error);
      return Promise.reject(error);
    });
};

accountService.saveToWaitingList = (profile) => {
  return basicOrchestraService.post('orchestraAccounts', {
    url: '/api/waiting-list/',
    body: profile,
  }).catch(error => {
    console.error(error);
    return Promise.reject(error);
  })
};

module.exports = accountService;
