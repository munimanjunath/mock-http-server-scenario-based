const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mime = require('mime-types');
const archiver = require('archiver');
const unzipper = require('unzipper');
const csvWriter = require('csv-writer');
const { DatabaseAdapter } = require('./db/db');
const logger = require('./logger');

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const filesDir = path.join(__dirname, 'files');

[uploadsDir, filesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info('Created directory', { dir });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const filename = `${path.basename(file.originalname, extension)}-${uniqueSuffix}${extension}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow all file types for maximum flexibility
    logger.debug('File upload attempted', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    cb(null, true);
  }
});

class FileManager {
  static getUploadMiddleware() {
    return upload.array('files', 10); // Allow up to 10 files
  }
  
  static async saveUploadedFiles(files, scenario, method = 'GET', basePath = '/files') {
    const savedFiles = [];
    
    for (const file of files) {
      try {
        const fileInfo = {
          filename: file.filename,
          originalName: file.originalname,
          filePath: file.path,
          mimeType: file.mimetype,
          fileSize: file.size,
          scenario: scenario,
          method: method,
          endpointPath: `${basePath}/${file.filename}`
        };
        
        const result = await DatabaseAdapter.saveFileInfo(fileInfo);
        
        logger.logFileOperation('upload', file.originalname, file.size);
        savedFiles.push({
          ...fileInfo,
          id: result.id
        });
      } catch (error) {
        logger.logFileOperation('upload', file.originalname, file.size, error);
        throw error;
      }
    }
    
    return savedFiles;
  }
  
  static async getFile(filename, scenario = null) {
    try {
      const filters = { filename };
      if (scenario) filters.scenario = scenario;
      
      const files = await DatabaseAdapter.getFiles(filters);
      
      if (files.length === 0) {
        return null;
      }
      
      const fileInfo = files[0];
      
      if (!fs.existsSync(fileInfo.file_path)) {
        logger.error('File not found on disk', { filename, path: fileInfo.file_path });
        return null;
      }
      
      return {
        ...fileInfo,
        stream: fs.createReadStream(fileInfo.file_path)
      };
    } catch (error) {
      logger.error('Failed to get file', { filename, error: error.message });
      return null;
    }
  }
  
  static async deleteFile(id) {
    try {
      // Get file info first
      const fileInfo = await DatabaseAdapter.getFiles({ id });
      if (fileInfo.length === 0) {
        throw new Error('File not found in database');
      }
      
      const file = fileInfo[0];
      
      // Delete from filesystem
      if (fs.existsSync(file.file_path)) {
        fs.unlinkSync(file.file_path);
        logger.logFileOperation('delete', file.original_name);
      }
      
      // Delete from database
      const result = await DatabaseAdapter.deleteFile(id);
      
      return result;
    } catch (error) {
      logger.error('Failed to delete file', { id, error: error.message });
      throw error;
    }
  }
  
  static async generateCSV(data, filename) {
    try {
      const filePath = path.join(filesDir, filename);
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Data must be a non-empty array');
      }
      
      const headers = Object.keys(data[0]).map(key => ({ id: key, title: key }));
      
      const writer = csvWriter.createObjectCsvWriter({
        path: filePath,
        header: headers
      });
      
      await writer.writeRecords(data);
      
      const stats = fs.statSync(filePath);
      logger.logFileOperation('generate_csv', filename, stats.size);
      
      return {
        filename,
        filePath,
        size: stats.size
      };
    } catch (error) {
      logger.logFileOperation('generate_csv', filename, null, error);
      throw error;
    }
  }
  
  static async createZipArchive(files, zipFilename) {
    try {
      const zipPath = path.join(filesDir, zipFilename);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      return new Promise((resolve, reject) => {
        output.on('close', () => {
          const stats = fs.statSync(zipPath);
          logger.logFileOperation('create_zip', zipFilename, stats.size);
          resolve({
            filename: zipFilename,
            filePath: zipPath,
            size: stats.size
          });
        });
        
        archive.on('error', (error) => {
          logger.logFileOperation('create_zip', zipFilename, null, error);
          reject(error);
        });
        
        archive.pipe(output);
        
        // Add files to archive
        files.forEach(file => {
          if (fs.existsSync(file.path)) {
            archive.file(file.path, { name: file.name || path.basename(file.path) });
          }
        });
        
        archive.finalize();
      });
    } catch (error) {
      logger.logFileOperation('create_zip', zipFilename, null, error);
      throw error;
    }
  }
  
  static async extractZipArchive(zipPath, extractPath) {
    try {
      const extractedFiles = [];
      
      await fs.createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
          const fileName = entry.path;
          const type = entry.type;
          const size = entry.size;
          
          if (type === 'File') {
            const filePath = path.join(extractPath, fileName);
            
            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            
            entry.pipe(fs.createWriteStream(filePath));
            extractedFiles.push({
              name: fileName,
              path: filePath,
              size: size
            });
          } else {
            entry.autodrain();
          }
        })
        .promise();
      
      logger.logFileOperation('extract_zip', path.basename(zipPath), extractedFiles.length);
      return extractedFiles;
    } catch (error) {
      logger.logFileOperation('extract_zip', path.basename(zipPath), null, error);
      throw error;
    }
  }
  
  static async getFileStats() {
    try {
      const files = await DatabaseAdapter.getFiles();
      
      const stats = {
        total_files: files.length,
        total_size: files.reduce((sum, file) => sum + (file.file_size || 0), 0),
        by_type: {},
        by_scenario: {}
      };
      
      files.forEach(file => {
        // Group by mime type
        const mimeType = file.mime_type || 'unknown';
        const category = mimeType.split('/')[0];
        stats.by_type[category] = (stats.by_type[category] || 0) + 1;
        
        // Group by scenario
        const scenario = file.scenario || 'default';
        stats.by_scenario[scenario] = (stats.by_scenario[scenario] || 0) + 1;
      });
      
      return stats;
    } catch (error) {
      logger.error('Failed to get file stats', { error: error.message });
      throw error;
    }
  }
  
  static getFileExtension(filename) {
    return path.extname(filename).toLowerCase();
  }
  
  static getMimeType(filename) {
    return mime.lookup(filename) || 'application/octet-stream';
  }
  
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = FileManager;