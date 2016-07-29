use db_photostream_test;

drop table comment;
drop table installationid_votes;
drop table photo;

CREATE TABLE IF NOT EXISTS `photo` (
  `photo_id` int(11) NOT NULL AUTO_INCREMENT,
  `installation_id` char(36) NOT NULL,
  `comment` varchar(300) DEFAULT NULL,
  `image` mediumtext CHARACTER SET ascii,
  PRIMARY KEY (`photo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `comment` (
  `comment_id` int(11) NOT NULL AUTO_INCREMENT,
  `photo_id` int(11) DEFAULT NULL,
  `installation_id` char(36) DEFAULT NULL,
  `message` varchar(200) NOT NULL,
  PRIMARY KEY (`comment_id`),
  KEY `comment_photo_id_idx` (`photo_id`),
  CONSTRAINT `comment_photo_id` FOREIGN KEY (`photo_id`) REFERENCES `photo` (`photo_id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS `installationid_votes` (
  `installation_id` char(36) NOT NULL,
  `photo_id` int(11) NOT NULL,
  `favorite` int(2) NOT NULL,
  PRIMARY KEY (`installation_id`,`photo_id`),
  KEY `installationid_votes_photo_idx` (`photo_id`),
  CONSTRAINT `installationid_votes_photo` FOREIGN KEY (`photo_id`) REFERENCES `photo` (`photo_id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8;