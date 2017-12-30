module.exports = {
  authSecret: 'deepmail-super-sicret',
  host: 'https://api.deepframe.io',
  allowedOrigins: ['http://localhost:4200', 'vs3.deepframe.io', 'https://glimpse.deepframe.io'],
  services: {
    nylas: {
      host: 'http://ip-10-10-4-142:5555',
      caPath: 'ssl-live/nylas/my-root-ca.crt.pem',
    },
    orchestraTopics: {
      host: 'https://ip-10-10-3-207:3004',
      caPath: 'ssl-live/orchestra-topics/my-root-ca.crt.pem',
    },
    notifications: {
      host: 'https://ip-10-10-3-207:3005',
      caPath: 'ssl-live/orchestra-notifications/my-root-ca.crt.pem',
    },
    orchestraAccounts: {
      host: 'https://ip-10-10-3-207:3006',
      caPath: 'ssl-live/orchestra-accounts/my-root-ca.crt.pem',
    },
    stitchSearch: {
      host: 'https://ip-10-10-3-207:3008',
      caPath: 'ssl-live/stitch-search/my-root-ca.crt.pem',
    }
  },
  mongodb: {
    agenda: {
      collection: 'agenda_jobs',
      url: 'mongodb://10.10.3.15:27017/deepframe-agenda'
    }
  },
  delayedSendSchedule: 'in 60 seconds',
  snoozeMessageSchedule: 'in 1 hour',
  cancelAccountSchedule: 'in 1 minute',
};
