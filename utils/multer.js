const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { getTenantConnection } = require('./tenantDbManager');
const { getClientModel } = require('../model/Client');

function sanitize(str) {
  if (!str) return '';
  return str.trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '');
}

function createUploader(relativePath) {
  const baseUploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "..", "public", "uploads");

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const slug = req.params.slug || 'default';
      const clientId = req.params.clientId || 'unknown_client';
      const destDir = path.join(baseUploadDir, slug, clientId);

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      cb(null, destDir);
    },
    filename: async function (req, file, cb) {
      try {
        const slug = req.params.slug || 'default';
        const clientId = req.params.clientId;
        const { memberId, category } = req.body;

        let clientName = 'client';
        let familyName = '';

        if (clientId) {
          try {
            const conn = await getTenantConnection(slug);
            const Client = getClientModel(conn);
            const client = await Client.findById(clientId).lean();
            if (client) {
              clientName = client.fullName;
            }
          } catch (dbErr) {
            console.error("Multer filename DB resolution error:", dbErr.message);
          }
        }

        const sanitizedClient = sanitize(clientName);
        const sanitizedFamily = sanitize(familyName);
        const sanitizedCategory = sanitize(category || 'document');
        const ext = path.extname(file.originalname);

        let finalName = '';
        if (sanitizedFamily) {
          finalName = `${slug}_${sanitizedClient}_${sanitizedFamily}_${sanitizedCategory}_${Date.now()}${ext}`;
        } else {
          finalName = `${slug}_${sanitizedClient}_${sanitizedCategory}_${Date.now()}${ext}`;
        }

        cb(null, finalName);
      } catch (err) {
        cb(err);
      }
    },
  });

  return multer({ storage });
}

module.exports = createUploader;
