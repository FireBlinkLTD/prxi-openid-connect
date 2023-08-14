module.exports = {
  filter(data) {
    console.log(data);
    return true
  },

  output: {
    path: process.env.LOG_FILE || './logs/prxi-openid-connect.log',
    isJson: false,
    options: {
      size: process.env.LOG_FILE_SIZE || "10M",
      rotate: +(process.env.LOG_FILE_ROTATE || 5)
    }
  }
}
