const request = require('request-promise-native');

const certificateAuthority = require('../../certificateAuthority');
const config = require('../../configs/index');
const coreResponse = require('../../core/response');
const errorMessages = require('../../core/errors');
const agendaService = require('../../services/agenda.service');


const controllers = {};


controllers.delete = (req, res) => {
  const accountId = req.user.inbox_account_id;

  if (!accountId) {
    return coreResponse.sendError(res, errorMessages.NO_INBOX_ACCOUNT, 400);
  }

  const accountParams = {
    url: `${config.services.orchestraAccounts.host}/api/account`,
    qs: {account_id: accountId},
    json: true,
    ca: certificateAuthority.orchestraAccounts,
  };

  const mailParams = {
    url: `${config.services.orchestraTopics.host}/api/messages`,
    qs: {account_id: accountId},
    auth: {
      user: accountId,
      pass: '',
      sendImmediately: false,
    },
    json: true,
    ca: certificateAuthority.orchestraTopics,
  };

  const agendaParams = {
    'data.user.id': accountId,
  };

  const requests = [];
  requests.push(request.delete(accountParams));
  requests.push(request.delete(mailParams));
  requests.push(agendaService.cancelJobs(agendaParams));

  Promise.all(requests)
    .then(result => {
      const userParams = { id: accountId };
      agendaService.jobs.createAccountCancel(userParams, config.cancelAccountSchedule, (error, data) => {
        if (error) {
          console.error(error);
          return res.status(400).json({success: false, error: 'account cancel job not saved'});
        }

        res.clearCookie('token');
        return coreResponse.sendSuccess(res, {});
      });
    })
    .catch(error => {
      console.error(error);
      return coreResponse.sendError(res, error, 500);
    });

};

module.exports = controllers;
