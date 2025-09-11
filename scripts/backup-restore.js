#!/usr/bin/env node

// Backup and Recovery Script for DPGen Pipeline
// Handles Firestore, Cloud Storage, and configuration backups

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { Firestore } = require('@google-cloud/firestore');

const CONFIG = {
  projectId: 'content-pipeline-7dd4f',
  backupBucket: 'dpgen-backups-7dd4f',
  serviceAccountPath: path.join(__dirname, '../config/service_account.json'),
  backupDir: path.join(__dirname, '../backups')
};

class BackupManager {
  constructor() {
    this.setupClients();
  }
  
  async setupClients() {
    const serviceAccount = JSON.parse(fs.readFileSync(CONFIG.serviceAccountPath, 'utf8'));
    
    this.auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    this.storage = google.storage({ version: 'v1', auth: this.auth });
    this.firestore = new Firestore({
      projectId: CONFIG.projectId,
      credentials: serviceAccount
    });
    
    // Ensure backup directory exists
    if (!fs.existsSync(CONFIG.backupDir)) {
      fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    }
  }
  
  // Create complete system backup
  async createBackup(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup_${timestamp}`;
    
    console.log(`🔄 Creating backup: ${backupId}`);
    console.log('================================\n');
    
    const manifest = {
      backup_id: backupId,
      timestamp,
      project_id: CONFIG.projectId,
      created_by: 'dpgen-backup-script',
      components: {},
      status: 'in_progress'
    };
    
    try {
      // Backup Firestore collections
      if (!options.skipFirestore) {
        console.log('📄 Backing up Firestore...');
        manifest.components.firestore = await this.backupFirestore(backupId);
      }
      
      // Backup Cloud Storage buckets
      if (!options.skipStorage) {
        console.log('🗂️ Backing up Cloud Storage...');
        manifest.components.storage = await this.backupCloudStorage(backupId);
      }
      
      // Backup configuration files
      if (!options.skipConfig) {
        console.log('⚙️ Backing up configuration...');
        manifest.components.config = await this.backupConfiguration(backupId);
      }
      
      // Backup workflows and code
      if (!options.skipCode) {
        console.log('💻 Backing up workflows...');
        manifest.components.workflows = await this.backupWorkflows(backupId);
      }
      
      manifest.status = 'completed';
      manifest.completed_at = new Date().toISOString();
      
      // Save manifest
      const manifestPath = path.join(CONFIG.backupDir, `${backupId}_manifest.json`);
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      
      // Upload to Cloud Storage
      await this.uploadBackupToCloud(backupId, manifest);
      
      console.log(`\n✅ Backup completed: ${backupId}`);
      console.log(`📄 Manifest: ${manifestPath}`);
      
      return manifest;
      
    } catch (error) {
      console.error(`❌ Backup failed: ${error.message}`);
      manifest.status = 'failed';
      manifest.error = error.message;
      return manifest;
    }
  }
  
  // Backup Firestore collections
  async backupFirestore(backupId) {
    const collections = ['channels', 'production_sessions', 'renders'];
    const firestoreBackup = {
      collections: {},
      total_documents: 0
    };
    
    for (const collectionName of collections) {
      console.log(`   Backing up collection: ${collectionName}`);
      
      const collectionRef = this.firestore.collection(collectionName);
      const snapshot = await collectionRef.get();
      
      const documents = [];
      snapshot.forEach(doc => {
        documents.push({
          id: doc.id,
          data: doc.data(),
          createTime: doc.createTime,
          updateTime: doc.updateTime
        });
      });
      
      // Include subcollections for channels
      if (collectionName === 'channels') {
        for (const doc of documents) {
          // Backup prompts subcollection
          const promptsRef = collectionRef.doc(doc.id).collection('prompts');
          const promptsSnapshot = await promptsRef.get();
          
          doc.subcollections = { prompts: [] };
          promptsSnapshot.forEach(promptDoc => {
            doc.subcollections.prompts.push({
              id: promptDoc.id,
              data: promptDoc.data()
            });
          });
          
          // Backup integrations subcollection
          const integrationsRef = collectionRef.doc(doc.id).collection('integrations');
          const integrationsSnapshot = await integrationsRef.get();
          
          doc.subcollections.integrations = [];
          integrationsSnapshot.forEach(intDoc => {
            doc.subcollections.integrations.push({
              id: intDoc.id,
              data: intDoc.data()
            });
          });
        }
      }
      
      firestoreBackup.collections[collectionName] = documents;
      firestoreBackup.total_documents += documents.length;
      
      console.log(`   ✓ ${documents.length} documents backed up`);
    }
    
    // Save to local file
    const firestorePath = path.join(CONFIG.backupDir, `${backupId}_firestore.json`);
    fs.writeFileSync(firestorePath, JSON.stringify(firestoreBackup, null, 2));
    
    console.log(`   📄 Firestore backup saved: ${firestorePath}`);
    return {
      file: firestorePath,
      collections: Object.keys(firestoreBackup.collections),
      total_documents: firestoreBackup.total_documents
    };
  }
  
  // Backup Cloud Storage buckets
  async backupCloudStorage(backupId) {
    console.log('   Listing DPGen buckets...');
    
    const bucketsResponse = await this.storage.buckets.list({
      project: CONFIG.projectId
    });
    
    const buckets = bucketsResponse.data.items || [];
    const dpgenBuckets = buckets.filter(b => b.name.includes('dpgen'));
    
    const storageBackup = {
      buckets: {},
      total_files: 0,
      total_size_bytes: 0
    };
    
    for (const bucket of dpgenBuckets) {
      console.log(`   Backing up bucket: ${bucket.name}`);
      
      const objectsResponse = await this.storage.objects.list({
        bucket: bucket.name,
        maxResults: 1000  // Limit for demo
      });
      
      const objects = objectsResponse.data.items || [];
      
      const bucketInfo = {
        name: bucket.name,
        objects: objects.map(obj => ({
          name: obj.name,
          size: parseInt(obj.size || 0),
          updated: obj.updated,
          contentType: obj.contentType,
          md5Hash: obj.md5Hash
        })),
        total_objects: objects.length,
        total_size: objects.reduce((sum, obj) => sum + parseInt(obj.size || 0), 0)
      };
      
      storageBackup.buckets[bucket.name] = bucketInfo;
      storageBackup.total_files += bucketInfo.total_objects;
      storageBackup.total_size_bytes += bucketInfo.total_size;
      
      console.log(`   ✓ ${bucketInfo.total_objects} objects catalogued`);
    }
    
    // Save inventory to local file
    const storagePath = path.join(CONFIG.backupDir, `${backupId}_storage_inventory.json`);
    fs.writeFileSync(storagePath, JSON.stringify(storageBackup, null, 2));
    
    console.log(`   📄 Storage inventory saved: ${storagePath}`);
    return {
      file: storagePath,
      buckets: Object.keys(storageBackup.buckets),
      total_files: storageBackup.total_files,
      total_size_mb: Math.round(storageBackup.total_size_bytes / 1024 / 1024)
    };
  }
  
  // Backup configuration files
  async backupConfiguration(backupId) {
    const configFiles = [
      'config/.env.example',
      'config/oauth_credentials.json',
      'package.json',
      'README.md',
      'QUICKSTART.md'
    ];
    
    const configBackup = {
      files: {},
      sensitive_files_excluded: ['config/service_account.json', 'config/.env']
    };
    
    for (const filePath of configFiles) {
      const fullPath = path.join(__dirname, '..', filePath);
      
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        configBackup.files[filePath] = {
          content,
          size: content.length,
          modified: fs.statSync(fullPath).mtime
        };
        console.log(`   ✓ Backed up: ${filePath}`);
      } else {
        console.log(`   ⚠️ File not found: ${filePath}`);
      }
    }
    
    // Save to local file
    const configPath = path.join(CONFIG.backupDir, `${backupId}_config.json`);
    fs.writeFileSync(configPath, JSON.stringify(configBackup, null, 2));
    
    return {
      file: configPath,
      files_backed_up: Object.keys(configBackup.files).length
    };
  }
  
  // Backup workflows and scripts
  async backupWorkflows(backupId) {
    const workflowDirs = [
      'workflows',
      'workflows-gcp', 
      'scripts',
      'agents',
      'monitoring'
    ];
    
    const workflowBackup = {
      directories: {},
      total_files: 0
    };
    
    for (const dir of workflowDirs) {
      const dirPath = path.join(__dirname, '..', dir);
      
      if (fs.existsSync(dirPath)) {
        const files = this.getFilesRecursively(dirPath);
        const dirBackup = {};
        
        for (const file of files) {
          const relativePath = path.relative(dirPath, file);
          const content = fs.readFileSync(file, 'utf8');
          
          dirBackup[relativePath] = {
            content,
            size: content.length,
            modified: fs.statSync(file).mtime
          };
        }
        
        workflowBackup.directories[dir] = dirBackup;
        workflowBackup.total_files += files.length;
        
        console.log(`   ✓ Backed up directory: ${dir} (${files.length} files)`);
      }
    }
    
    // Save to local file
    const workflowPath = path.join(CONFIG.backupDir, `${backupId}_workflows.json`);
    fs.writeFileSync(workflowPath, JSON.stringify(workflowBackup, null, 2));
    
    return {
      file: workflowPath,
      directories: Object.keys(workflowBackup.directories),
      total_files: workflowBackup.total_files
    };
  }
  
  // Upload backup to Cloud Storage
  async uploadBackupToCloud(backupId, manifest) {
    console.log('\n☁️ Uploading backup to Cloud Storage...');
    
    try {
      // Create backup bucket if it doesn't exist
      try {
        await this.storage.buckets.insert({
          project: CONFIG.projectId,
          requestBody: {
            name: CONFIG.backupBucket,
            location: 'US',
            storageClass: 'NEARLINE'  // Cost-effective for backups
          }
        });
        console.log(`   ✓ Created backup bucket: ${CONFIG.backupBucket}`);
      } catch (error) {
        if (error.code !== 409) {  // 409 = already exists
          throw error;
        }
      }
      
      // Upload all backup files
      const backupFiles = fs.readdirSync(CONFIG.backupDir)
        .filter(f => f.startsWith(backupId))
        .map(f => path.join(CONFIG.backupDir, f));
      
      for (const file of backupFiles) {
        const fileName = path.basename(file);
        const objectName = `${backupId}/${fileName}`;
        
        const fileContent = fs.readFileSync(file);
        
        await this.storage.objects.insert({
          bucket: CONFIG.backupBucket,
          name: objectName,
          uploadType: 'media',
          requestBody: {
            name: objectName,
            metadata: {
              backup_id: backupId,
              backup_type: 'dpgen_pipeline',
              created_by: 'backup_script'
            }
          }
        }, {
          body: fileContent
        });
        
        console.log(`   ✓ Uploaded: ${objectName}`);
      }
      
      console.log(`   📦 Backup stored in: gs://${CONFIG.backupBucket}/${backupId}/`);
      
    } catch (error) {
      console.error(`   ❌ Cloud upload failed: ${error.message}`);
      throw error;
    }
  }
  
  // List available backups
  async listBackups() {
    console.log('📋 Available Backups');
    console.log('===================\n');
    
    try {
      // List local backups
      const localBackups = fs.readdirSync(CONFIG.backupDir)
        .filter(f => f.endsWith('_manifest.json'))
        .map(f => {
          const manifest = JSON.parse(fs.readFileSync(path.join(CONFIG.backupDir, f), 'utf8'));
          return {
            ...manifest,
            location: 'local',
            manifest_file: f
          };
        });
      
      // List cloud backups
      let cloudBackups = [];
      try {
        const objectsResponse = await this.storage.objects.list({
          bucket: CONFIG.backupBucket,
          delimiter: '/'
        });
        
        const prefixes = objectsResponse.data.prefixes || [];
        cloudBackups = prefixes.map(prefix => ({
          backup_id: prefix.replace('/', ''),
          location: 'cloud',
          prefix
        }));
      } catch (error) {
        console.log('⚠️ Could not list cloud backups (bucket may not exist)');
      }
      
      // Display results
      if (localBackups.length === 0 && cloudBackups.length === 0) {
        console.log('No backups found.');
        return;
      }
      
      if (localBackups.length > 0) {
        console.log('Local Backups:');
        localBackups.forEach(backup => {
          const status = backup.status === 'completed' ? '✅' : '❌';
          console.log(`  ${status} ${backup.backup_id} (${backup.timestamp})`);
          console.log(`     Components: ${Object.keys(backup.components || {}).join(', ')}`);
        });
        console.log();
      }
      
      if (cloudBackups.length > 0) {
        console.log('Cloud Backups:');
        cloudBackups.forEach(backup => {
          console.log(`  ☁️ ${backup.backup_id}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Failed to list backups:', error.message);
    }
  }
  
  // Restore from backup
  async restoreBackup(backupId, options = {}) {
    console.log(`🔄 Restoring backup: ${backupId}`);
    console.log('===============================\n');
    
    try {
      // Load manifest
      const manifestPath = path.join(CONFIG.backupDir, `${backupId}_manifest.json`);
      
      if (!fs.existsSync(manifestPath)) {
        // Try to download from cloud
        await this.downloadBackupFromCloud(backupId);
      }
      
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      if (manifest.status !== 'completed') {
        throw new Error(`Backup ${backupId} is not in completed state: ${manifest.status}`);
      }
      
      // Restore components
      if (manifest.components.firestore && !options.skipFirestore) {
        console.log('📄 Restoring Firestore...');
        await this.restoreFirestore(backupId, manifest.components.firestore);
      }
      
      if (manifest.components.config && !options.skipConfig) {
        console.log('⚙️ Restoring configuration...');
        await this.restoreConfiguration(backupId, manifest.components.config);
      }
      
      console.log('\n✅ Restore completed successfully!');
      console.log('\n⚠️ Manual steps required:');
      console.log('  1. Review restored configuration files');
      console.log('  2. Update API keys if needed');
      console.log('  3. Test pipeline components');
      
    } catch (error) {
      console.error(`❌ Restore failed: ${error.message}`);
      throw error;
    }
  }
  
  // Helper: Get files recursively
  getFilesRecursively(dir) {
    const files = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getFilesRecursively(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  // Helper: Restore Firestore data
  async restoreFirestore(backupId, component) {
    const firestorePath = path.join(CONFIG.backupDir, `${backupId}_firestore.json`);
    const firestoreData = JSON.parse(fs.readFileSync(firestorePath, 'utf8'));
    
    for (const [collectionName, documents] of Object.entries(firestoreData.collections)) {
      console.log(`   Restoring collection: ${collectionName}`);
      
      const collectionRef = this.firestore.collection(collectionName);
      
      for (const doc of documents) {
        // Restore main document
        await collectionRef.doc(doc.id).set(doc.data, { merge: true });
        
        // Restore subcollections if they exist
        if (doc.subcollections) {
          for (const [subCollectionName, subDocs] of Object.entries(doc.subcollections)) {
            const subCollectionRef = collectionRef.doc(doc.id).collection(subCollectionName);
            
            for (const subDoc of subDocs) {
              await subCollectionRef.doc(subDoc.id).set(subDoc.data, { merge: true });
            }
          }
        }
      }
      
      console.log(`   ✓ Restored ${documents.length} documents`);
    }
  }
  
  // Helper: Restore configuration
  async restoreConfiguration(backupId, component) {
    const configPath = path.join(CONFIG.backupDir, `${backupId}_config.json`);
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    for (const [filePath, fileData] of Object.entries(configData.files)) {
      const fullPath = path.join(__dirname, '..', filePath);
      
      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write file (but don't overwrite sensitive files)
      if (!filePath.includes('service_account') && !filePath.includes('.env')) {
        fs.writeFileSync(fullPath, fileData.content);
        console.log(`   ✓ Restored: ${filePath}`);
      } else {
        console.log(`   ⚠️ Skipped sensitive file: ${filePath}`);
      }
    }
  }
  
  // Helper: Download backup from cloud
  async downloadBackupFromCloud(backupId) {
    console.log(`   Downloading backup from cloud: ${backupId}`);
    
    const objectsResponse = await this.storage.objects.list({
      bucket: CONFIG.backupBucket,
      prefix: `${backupId}/`
    });
    
    const objects = objectsResponse.data.items || [];
    
    for (const obj of objects) {
      const fileName = path.basename(obj.name);
      const localPath = path.join(CONFIG.backupDir, fileName);
      
      const response = await this.storage.objects.get({
        bucket: CONFIG.backupBucket,
        object: obj.name,
        alt: 'media'
      });
      
      fs.writeFileSync(localPath, response.data);
      console.log(`   ✓ Downloaded: ${fileName}`);
    }
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  const manager = new BackupManager();
  await manager.setupClients();
  
  switch (command) {
    case 'create':
      await manager.createBackup();
      break;
      
    case 'list':
      await manager.listBackups();
      break;
      
    case 'restore':
      if (!arg) {
        console.error('Usage: node backup-restore.js restore <backup_id>');
        process.exit(1);
      }
      await manager.restoreBackup(arg);
      break;
      
    default:
      console.log('DPGen Backup & Recovery Tool');
      console.log('============================');
      console.log('');
      console.log('Usage:');
      console.log('  node backup-restore.js create          # Create new backup');
      console.log('  node backup-restore.js list            # List available backups');
      console.log('  node backup-restore.js restore <id>    # Restore from backup');
      console.log('');
      console.log('Examples:');
      console.log('  node backup-restore.js create');
      console.log('  node backup-restore.js restore backup_2024-01-15T10-30-00-000Z');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  });
}

module.exports = BackupManager;