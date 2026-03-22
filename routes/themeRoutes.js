const express = require('express');
const router = express.Router();
const themeController = require('../controllers/themeController');

router.get('/', themeController.getThemes);
router.get('/:id', themeController.getThemeById);
router.post('/', themeController.createTheme);
router.post('/generate', themeController.generateThemeWords); // [NEW] AI 캐싱 라우터 
router.delete('/:id', themeController.deleteTheme);

module.exports = router;