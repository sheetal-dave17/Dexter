const fs = require('fs');
const config = require('./configs');


module.exports = {
  nylas: fs.readFileSync(`${__dirname}/${config.services.nylas.caPath}`),
  orchestraAccounts: fs.readFileSync(`${__dirname}/${config.services.orchestraAccounts.caPath}`),
  orchestraNotifications: fs.readFileSync(`${__dirname}/${config.services.notifications.caPath}`),
  orchestraTopics: fs.readFileSync(`${__dirname}/${config.services.orchestraTopics.caPath}`),
  stitchSearch: fs.readFileSync(`${__dirname}/${config.services.stitchSearch.caPath}`),
};
