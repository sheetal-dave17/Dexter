const knowledgeGraphService = require('../../services/knowledge-graph');
const coreResponse = require('../../core/response');

const controllers = {};

const getFilters = (query) => {
  let filters = {};
  if(query.message_id) filters['message_id'] = query.message_id;
  if(query.contact_name) filters['contact_name'] = query.contact_name;
  if(query.contact_email) filters['contact_email'] = query.contact_email;
  if(query.topic) filters['topic'] = query.topic;
  if(query.related_topic) filters['related_topic'] = query.related_topic;
  if(query.related_contact_name) filters['related_contact_name'] = query.related_contact_name;
  if(query.related_contact_email) filters['related_contact_email'] = query.related_contact_email;
  if(query.ignore_contact_name) filters['ignore_contact_name'] = query.ignore_contact_name;
  if(query.ignore_contact_email) filters['ignore_contact_email'] = query.ignore_contact_email;
  if(query.mail_order) filters['mail_order'] = query.mail_order;
  return filters;
}

controllers.getRelatedInfo = (req, res) => {
  const limits = {
    topics: req.query.topics_limit || 6,
    connections: req.query.connections_limit || 7,
    messages: req.query.messages_limit || 7,
    images: req.query.images_limit || 9,
    documents: req.query.documents_limit || 6,
    videos: req.query.videos_limit || 2,
    allTypes: req.query.all_files_limit || 10,
  };

  Promise.all([
    knowledgeGraphService.getRelatedTopics(req.user.inbox_account_id, getFilters(req.query), limits.topics, 0),
    knowledgeGraphService.getRelatedConnections(req.user.inbox_account_id, getFilters(req.query), limits.connections, 0),
    knowledgeGraphService.getRelatedMessages(req.user.inbox_account_id, getFilters(req.query), limits.messages, 0),
    knowledgeGraphService.getRelatedFiles(req.user.inbox_account_id, 'images', getFilters(req.query), limits.images, 0),
    knowledgeGraphService.getRelatedFiles(req.user.inbox_account_id, 'videos', getFilters(req.query), limits.videos, 0),
    knowledgeGraphService.getRelatedFiles(req.user.inbox_account_id, 'documents', getFilters(req.query), limits.documents, 0),
    knowledgeGraphService.getRelatedFiles(req.user.inbox_account_id, 'allTypes', getFilters(req.query), limits.allTypes, 0),
  ]).then(result => {
    coreResponse.sendSuccess(res, {
      topics: {
        data: result[0].topics,
        count: result[0].total
      },
      connections: result[1],
      messages: {data: result[2].data.map(coreResponse.formatMessage), count: result[2].count},
      files: {
        images: {data: result[3].data.map(coreResponse.formatFile), count: result[3].count},
        videos: {data: result[4].data.map(coreResponse.formatFile), count: result[4].count},
        documents: {data: result[5].data.map(coreResponse.formatFile), count: result[5].count},
        allTypes: {data: result[6].data.map(coreResponse.formatFile), count: result[6].count}
      }
    })
  })
}

controllers.getRelatedTopics = (req, res) => {
  knowledgeGraphService.getRelatedTopics(req.user.inbox_account_id, getFilters(req.query), req.query.limit, req.query.offset)
    .then(result => coreResponse.sendSuccess(res, {data: result.topics, count: result.total}))
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
}

controllers.getRelatedConnections = (req, res) => {
  knowledgeGraphService.getRelatedConnections(req.user.inbox_account_id, getFilters(req.query), req.query.limit, req.query.offset)
    .then(result => coreResponse.sendSuccess(res, result))
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
}

controllers.getRelatedMessages = (req, res) => {
  knowledgeGraphService.getRelatedMessages(req.user.inbox_account_id, getFilters(req.query), req.query.limit, req.query.offset)
    .then(result => coreResponse.sendSuccess(res, {data: result.data.map(coreResponse.formatMessage), count: result.count}))
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
}

controllers.getRelatedFiles = (req, res) => {
  knowledgeGraphService.getRelatedFiles(req.user.inbox_account_id, req.params.type, getFilters(req.query), req.query.limit, req.query.offset)
    .then(result => coreResponse.sendSuccess(res, {data: result.data.map(coreResponse.formatFile), count: result.count}))
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
}

module.exports = controllers;
