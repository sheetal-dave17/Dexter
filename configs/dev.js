module.exports = {
  authSecret: 'deepmail-super-sicret',
  host: 'https://localhost:3000',
  allowedOrigins: ['http://localhost:4200', 'vs3.deepframe.io'],
  services: {
    nylas: {
      host: 'http://localhost:5555',
      caPath: 'ssl/nylas/my-root-ca.crt.pem',
    },
    orchestraTopics: {
      host: 'https://localhost:3004',
      caPath: 'ssl/orchestra-topics/my-root-ca.crt.pem',
    },
    notifications: {
      host: 'https://localhost:3005',
      caPath: 'ssl/orchestra-notifications/my-root-ca.crt.pem',
    },
    orchestraAccounts: {
      host: 'https://localhost:3006',
      caPath: 'ssl/orchestra-accounts/my-root-ca.crt.pem',
    },
    stitchSearch: {
      host: 'https://localhost:3008',
      caPath: 'ssl/stitch-search/my-root-ca.crt.pem',
    }
  },
  mongodb: {
    agenda: {
      collection: 'agenda_jobs',
      url: 'mongodb://localhost:27017/deepframe-agenda'
    }
  },
  delayedSendSchedule: 'in 60 seconds',
  snoozeMessageSchedule: 'in 1 hour',
  cancelAccountSchedule: 'in 1 minute',
};
