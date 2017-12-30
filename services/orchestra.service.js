const request = require('request-promise-native');

const config = require('../configs');
const certificateAuthority = require('../certificateAuthority');

const basicOrchestraService = {
  get: (serviceName, requestData) => {
    if (!requestData.url || requestData.url === '') {
      return Promise.reject({error: 'No url specified'});
    }
    return request.get({
      url: config.services[serviceName].host + requestData.url,
      qs: requestData.qs,
      json: true,
      ca: certificateAuthority[serviceName],
    })
  },
  post: (serviceName, requestData) => {
    if (!requestData.url || requestData.url === '') {
      return Promise.reject({error: 'No url specified'});
    }

    return request.post({
      url: config.services[serviceName].host + requestData.url,
      qs: requestData.qs,
      body: requestData.body,
      json: true,
      ca: certificateAuthority[serviceName],
    })
  },
  put: (serviceName, requestData) => {
    // @TO BE IMPLEMENTED
    console.error('Method not implemented');
    return Promise.reject({error: 'Not implemented'});
  },
  delete: (serviceName, requestData) => {
    // @TO BE IMPLEMENTED
    console.error('Method not implemented');
    return Promise.reject({error: 'Not implemented'});
  }
}

module.exports = basicOrchestraService;
