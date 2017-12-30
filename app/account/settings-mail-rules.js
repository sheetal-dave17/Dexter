const request = require('request-promise-native');

const certificateAuthority = require('../../certificateAuthority');
const config = require('../../configs/index');
const coreResponse = require('../../core/response');
const errorMessages = require('../../core/errors');

const controllers = {};


controllers.get = (req, res) => {
  if (!req.user.inbox_account_id) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  const params = {
    url: config.services.orchestraAccounts.host + '/api/account/mail-rules',
    qs: {account_id: req.user.inbox_account_id},
    json: true,
    ca: certificateAuthority.orchestraAccounts,
  };

  request.get(params)
    .then(response => {
      return coreResponse.sendSuccess(res, {
        mailRules: response.data
      });
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
};

controllers.post = (req, res) => {
  if (!req.user.inbox_account_id) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  const rule = {
    title: req.body.title,
    conditionName: req.body.conditionName,
    conditionRule: req.body.conditionRule,
    conditionValue: req.body.conditionValue,
    actionName: req.body.actionName,
    actionValue: req.body.actionValue,
  };

  if (!rule.title) {
    return coreResponse.sendError(res, 'title is missed', 400);
  }

  if (!rule.conditionName) {
    return coreResponse.sendError(res, 'conditionName is missed', 400);
  }

  if (!rule.conditionRule) {
    return coreResponse.sendError(res, 'conditionRule is missed', 400);
  }

  if (!rule.conditionValue) {
    return coreResponse.sendError(res, 'conditionValue is missed', 400);
  }

  if (!rule.actionName) {
    return coreResponse.sendError(res, 'actionName is missed', 400);
  }

  const params = {
    url: config.services.orchestraAccounts.host + '/api/account/mail-rules',
    qs: {account_id: req.user.inbox_account_id},
    body: rule,
    json: true,
    ca: certificateAuthority.orchestraAccounts,
  };

  request.post(params)
    .then(response => {
      return coreResponse.sendSuccess(res, {});
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
};

controllers.put = (req, res) => {
  if (!req.user.inbox_account_id) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  const rule = {
    title: req.body.title,
    conditionName: req.body.conditionName,
    conditionRule: req.body.conditionRule,
    conditionValue: req.body.conditionValue,
    actionName: req.body.actionName,
    actionValue: req.body.actionValue,
  };

  if (!rule.title) {
    return coreResponse.sendError(res, 'title is missed', 400);
  }

  if (!rule.conditionName) {
    return coreResponse.sendError(res, 'conditionName is missed', 400);
  }

  if (!rule.conditionRule) {
    return coreResponse.sendError(res, 'conditionRule is missed', 400);
  }

  if (!rule.conditionValue) {
    return coreResponse.sendError(res, 'conditionValue is missed', 400);
  }

  if (!rule.actionName) {
    return coreResponse.sendError(res, 'actionName is missed', 400);
  }

  const params = {
    url: config.services.orchestraAccounts.host + `/api/account/mail-rules/${req.params.id}`,
    body: rule,
    qs: {account_id: req.user.inbox_account_id},
    json: true,
    ca: certificateAuthority.orchestraAccounts,
  };

  request.put(params)
    .then(response => {
      return coreResponse.sendSuccess(res, {});
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
};

controllers.delete = (req, res) => {
  if (!req.user.inbox_account_id) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  const params = {
    url: config.services.orchestraAccounts.host + `/api/account/mail-rules/${req.params.id}`,
    qs: {account_id: req.user.inbox_account_id},
    json: true,
    ca: certificateAuthority.orchestraAccounts,
  };

  request.delete(params)
    .then(response => {
      return coreResponse.sendSuccess(res, {});
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });
};

module.exports = controllers;
