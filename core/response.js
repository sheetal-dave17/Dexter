const errorMessages = require('./errors');
const config = require('../configs');

const formatMessage = (message) => {
  return {
    id: message.messageId,
    subject: message.subject,
    snippet: message.snippet,
    body: message.body,
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    participants: message.participants,
    sentTime: message.date,
    unread: message.unread,
    pinned: message.pinned,
    starred: message.starred,
    files: !message.files ? [] : message.files.map(formatFile),
    thread: message.threadId,
    replied: message.replied,
    forwarded: message.forwarded,
    topics: !message.topics ? [] : message.topics.map(topic => {
      return {name: topic.name, offsets: topic.htmlOffsets}
    }),
    labels: message.labels,
  };
}

const formatFile = (file) => {
  return {
    id: file.id,
    name: file.filename || file.content_id,
    url: config.host + "/api/mail/files/"+file.id,
    type: file.content_type,
    size: file.size
  }
}

const sendError = function (response, error, code = 400) {
  return response.status(code).json({
    success: false,
    error: error || errorMessages.UNKNOWN_ERROR
  });
};


const sendSuccess = function (response, data, code = 200) {
  return response.status(code).json({
    success: true,
    data: data || {}
  });
};


module.exports = {
  sendError,
  sendSuccess,
  formatMessage,
  formatFile
};
