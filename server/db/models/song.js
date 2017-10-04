const Sequelize = require('sequelize');
const db = require('../db');

const Song = db.define('song', {
  filename: {
    type: Sequelize.STRING,
    unique: true,
    allowNull: false,
  },
  trackArtUrl: {
    type: Sequelize.STRING,
  },
  notes: {
    type: Sequelize.TEXT,
  },
  length: Sequelize.FLOAT,
  playcount: {
    type: Sequelize.INTEGER,
    defaultValue: 0,
  },
  title: {
    type: Sequelize.STRING,
    allowNull: false,
    defaultValue: 'untitled',
  },
  url: {
    type: Sequelize.VIRTUAL,
    get(){
      return 'https://s3.amazonaws.com/soundcrowd-files-fullstack/' + this.getDataValue('filename');
    }
  }
});

Song.prototype.incrementPlaycount = function () {
  return this.update({ playcount: this.playcount + 1 });
};

Song.prototype.like = function (userId) {
  return this.addUser(userId);
};

Song.prototype.unlike = function (userId) {
  return this.removeUser(userId);
};

module.exports = Song;
