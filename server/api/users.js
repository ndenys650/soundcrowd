const router = require('express').Router()
const { User, Song, Comment, Project } = require('../db/models')
module.exports = router

router.get('/', (req, res, next) => {
  User.findAll({
    // explicitly select only the id and email fields - even though
    // users' passwords are encrypted, it won't help if we just
    // send everything to anyone who asks!
    attributes: ['id', 'username']
  })
    .then(users => res.json(users))
    .catch(next)
})

router.get('/:id/songs', (req, res, next) => {
  const userId = Number(req.params.id);
  Song.findAll({ where: { '$artist.id$': userId }, include: [{ model: User, as: 'artist', though: 'collaborators' }] })
    .then(songs => res.json(songs))
    .catch(next);
});

router.get('/:id/comments', (req, res, next) => {
  const id = Number(req.params.id);
  User.findOne({ where: { id: id }, include: [{ model: Comment }] })
    .then(user => res.json(user.comments))
    .catch(next);
})


router.get('/:id/projects', (req, res, next) => {
  const userId = Number(req.params.id);
  Project.findAll({ where: { '$users.id$': userId }, include: [{ model: User, though: 'usersProjects' }] })
    .then(projects => res.json(projects))
    .catch(next);
});

router.get('/fb/:id', (req, res, next) => {
  User.findOne({
    // explicitly select only the id and email fields - even though
    // users' passwords are encrypted, it won't help if we just
    // send everything to anyone who asks!
    attributes: ['id', 'username'],
    where: { facebookId: req.params.id },
  })
    .then(users => res.json(users))
    .catch(next);
});

router.get('/:id', (req, res, next) => {
  User.findById(Number(req.params.id))
    .then(users => res.json(users))
    .catch(next);
});
