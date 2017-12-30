const os = require('os');

const Agenda = require('agenda');

const config = require('../configs/');

const notificationService = require('./notification.service');
const nylasService = require('./nylas.service');


const agenda = new Agenda({
  db: {
    address: config.mongodb.agenda.url,
    collection: config.mongodb.agenda.collection,
  },
  name: os.hostname() + '-' + process.pid,
});

agenda.on('ready', () => {
  agenda.start();
});
agenda.on('error', error => {
  console.error(error);
});


const JOB_NAMES = {
  MAIL_SEND_DELAYED: 'mail-send-delayed',
  MAIL_SNOOZE: 'mail-snooze',
  ACCOUNT_CANCEL: 'account-cancel',
};

const MESSAGE_ERRORS = {
  messageIdMissed: 'message.id is missed',
  userIdMissed: 'user.id is missed',
};


const createSnooze = (messageId, userId, schedule, callback) => {
  const job = agenda.create(
    JOB_NAMES.MAIL_SNOOZE,
    {
      message: {
        id: messageId,
      },
      user: {
        id: userId,
      },
    }
  );

  job.schedule(schedule);

  job.save((error, data) => {
    if (error) {
      console.error(error);
    }
    return callback(error, data);
  });
};

const createDelayedSend = (message, user, delaySchedule, options, callback) => {
  const job = agenda.create(
    JOB_NAMES.MAIL_SEND_DELAYED,
    {
      message,
      user,
      options,
    }
  );

  job.schedule(delaySchedule);

  job.save(callback);
};

const createAccountCancel = (user, schedule, callback) => {
  const job = agenda.create(
    JOB_NAMES.ACCOUNT_CANCEL,
    {
      user,
    }
  );

  job.schedule(schedule);

  job.save(callback);
};


const cancelJobs = (conditions) => {
  return new Promise((resolve, reject) => {
    agenda.cancel(conditions, (error, data) => {
      if (error) {
        return reject(error);
      }

      return resolve(data);
    });
  });
};



agenda.define(JOB_NAMES.MAIL_SEND_DELAYED, (job, done) => {
  const message = job.attrs.data.message;
  const user = job.attrs.data.user;
  const options = job.attrs.data.options;

  const followUpEmailTimestamp = options.followUpEmailTimestamp;

  if (!user.id) {
    return done(new Error(MESSAGE_ERRORS.userIdMissed));
  }

  nylasService.sendMessage(message, user)
    .then(sentMessage => {
      if (followUpEmailTimestamp) {
        return createSnooze(sentMessage.id, user.id, followUpEmailTimestamp, done);
      }

      return done(null, sentMessage);
    })
    .catch(error => {
      console.error(error);
      return done(error);
    });
});


agenda.define(JOB_NAMES.MAIL_SNOOZE, (job, done) => {
  const messageId = job.attrs.data.message;
  const userId = job.attrs.data.user.id;

  if (!messageId) {
    return done(new Error(MESSAGE_ERRORS.messageIdMissed));
  }

  if (!userId) {
    return done(new Error(MESSAGE_ERRORS.userIdMissed));
  }

  return notificationService.snoozeEmail(userId, messageId)
    .then(result => {
      return done(null, result);
    })
    .catch(error => {
      return done(error);
    });
});


agenda.define(JOB_NAMES.ACCOUNT_CANCEL, (job, done) => {
  const accountId = job.attrs.data.user.id;

  if (!accountId) {
    return done(new Error(MESSAGE_ERRORS.userIdMissed));
  }

  return nylasService.deleteAccount(accountId)
    .then(result => {
      return done(null, result);
    })
    .catch(error => {
      return done(error);
    });
});


module.exports = {
  job_names: JOB_NAMES,
  jobs: {
    createSnooze,
    createDelayedSend,
    createAccountCancel,
  },
  cancelJobs,
};
