const express = require('express');
const router = express.Router();
const themeController = require('../controllers/themeController');

router.get('/', themeController.getThemes);
router.get('/:id', themeController.getThemeById);
router.post('/', themeController.createTheme);
router.delete('/:id', themeController.deleteTheme);

module.exports = router;