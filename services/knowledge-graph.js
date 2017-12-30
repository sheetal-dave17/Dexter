const request = require('request-promise-native');

const certificateAuthority = require('../certificateAuthority');
const config = require('../configs');


const knowledgeGraphService = {};

knowledgeGraphService.getRelatedTopics = (accountId, filters, limit, offset) => {
  return request
    .get({
      url: config.services.orchestraTopics.host + '/api/knowledge-graph/topics',
      qs: Object.assign({
            account_id: accountId,
            limit: limit,
            offset: offset,
          },
          filters
      ),
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
}

knowledgeGraphService.getRelatedConnections = (accountId, filters, limit, offset) => {
  return request
    .get({
      url: config.services.orchestraTopics.host + '/api/knowledge-graph/connections',
      qs: Object.assign({
            account_id: accountId,
            limit: limit,
            offset: offset,
          },
          filters
      ),
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(result => Promise.resolve({
      data: result.connections,
      count: result.total
    }))
}

knowledgeGraphService.getRelatedMessages = (accountId, filters, limit, offset) => {
  return request
    .get({
      url: config.services.orchestraTopics.host + '/api/knowledge-graph/messages',
      qs: Object.assign({
            account_id: accountId,
            limit: limit,
            offset: offset,
          },
          filters
      ),
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(result => Promise.resolve({data: result.messages, count: result.count}))
}

knowledgeGraphService.getRelatedFiles = (accountId, type, filters, limit, offset) => {
  return request
    .get({
      url: config.services.orchestraTopics.host + '/api/knowledge-graph/files/' + type,
      qs: Object.assign({
            account_id: accountId,
            limit: limit,
            offset: offset,
          },
          filters
      ),
      json: true,
      ca: certificateAuthority.orchestraTopics,
    })
    .then(result => Promise.resolve({data: result.files, count: result.total}))
}

module.exports = knowledgeGraphService;
