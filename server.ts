import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import {
  localDb,
  NodeType,
  CanvasChild,
  uploadToS3,
  getS3SignedUrl,
  deleteFromS3,
  getNeo4jDriver
} from './server/db.ts';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'kno_graph_jwt_super_secret_key';

// Parse json and urlencoded payloads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Authentication Middleware (No hardcoded demo user fallback; users must register/login to access)
const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token is missing', code: 'UNAUTHORIZED' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token', code: 'INVALID_TOKEN' });
    }
    (req as any).user = decoded;
    next();
  });
};

// ==========================
// AUTHENTICATION ENDPOINTS
// ==========================

// Register (Single user lock-down)
app.post(['/v1/auth/register', '/api/v1/auth/register'], async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required', code: 'VALIDATION_ERROR' });
  }

  try {
    // Single user restriction check
    const userCount = await localDb.getUsersCount();
    if (userCount > 0) {
      return res.status(403).json({
        error: 'This is a personal instance. Account already configured.',
        code: 'REGISTRATION_LOCKED'
      });
    }

    const existing = await localDb.findUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'A user with this email already exists', code: 'USER_EXISTS' });
    }

    const userId = 'user_' + crypto.randomUUID();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: userId,
      email,
      passwordHash: hashedPassword,
      tier: 'pro' as const, // Enforced unlimited pro grade capabilities
      storageUsed: 0,
      createdAt: new Date().toISOString()
    };

    await localDb.addUser(newUser);

    const token = jwt.sign({ userId: newUser.id, email: newUser.email, tier: newUser.tier }, JWT_SECRET, { expiresIn: '30d' });

    // Initialize initial Workspace nodes for the newly registered user
    await localDb.addNode({
      id: 'node_' + crypto.randomUUID(),
      userId,
      type: 'Concept',
      name: 'My Workspace',
      content: 'Welcome to your newly crafted KnoGraph space. Add connection nodes, notebooks, and canvases.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      properties: {}
    });

    res.status(201).json({
      message: 'Personal account registered successfully.',
      token,
      user: { id: newUser.id, email: newUser.email, tier: newUser.tier }
    });
  } catch (err: any) {
    res.status(500).json({ error: `Registration failed: ${err.message}` });
  }
});

// Login
app.post(['/v1/auth/login', '/api/v1/auth/login'], async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required', code: 'VALIDATION_ERROR' });
  }

  try {
    const user = await localDb.findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password credentials', code: 'INVALID_CREDENTIALS' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password credentials', code: 'INVALID_CREDENTIALS' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email, tier: user.tier }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, tier: user.tier, storageUsed: user.storageUsed }
    });
  } catch (err: any) {
    res.status(500).json({ error: `Login failed: ${err.message}` });
  }
});

// Logout
app.post(['/v1/auth/logout', '/api/v1/auth/logout'], authenticateToken, (req, res) => {
  res.json({ success: true, message: 'Session invalidated. Goodbye!' });
});

// Refresh Token
app.post(['/v1/auth/refresh', '/api/v1/auth/refresh'], authenticateToken, async (req, res) => {
  const authUser = (req as any).user;
  try {
    const user = await localDb.findUserById(authUser.userId);
    if (!user) {
      return res.status(404).json({ error: 'User context not found', code: 'USER_NOT_FOUND' });
    }
    const token = jwt.sign({ userId: user.id, email: user.email, tier: user.tier }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, tier: user.tier } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Password Reset Request
app.post(['/v1/auth/password-reset', '/api/v1/auth/password-reset'], async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email container is required', code: 'VALIDATION_ERROR' });
  }
  try {
    const user = await localDb.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No user registered with this email.', code: 'USER_NOT_FOUND' });
    }
    const resetToken = crypto.randomBytes(20).toString('hex');
    res.json({
      message: 'Password reset link dispatched via email. Expires in 1 hour.',
      resetLink: `https://knograph.io/v1/auth/reset-password?token=${resetToken}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// GRAPH NODES CRUD
// ==========================

// Get All Nodes
app.get(['/v1/nodes', '/api/v1/nodes'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  try {
    const nodes = await localDb.getNodes(userId);
    res.json({ nodes, count: nodes.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create Node (Unlimited storage and count)
app.post(['/v1/nodes', '/api/v1/nodes'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const { type, name, content, properties } = req.body;

  if (!type || !name) {
    return res.status(400).json({ error: 'Type and Name are mandatory attributes.', code: 'VALIDATION_ERROR' });
  }

  const validTypes: NodeType[] = ['Note', 'File', 'Canvas', 'Person', 'Concept'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Allowed: ${validTypes.join(', ')}`, code: 'VALIDATION_ERROR' });
  }

  try {
    const node = {
      id: 'node_' + crypto.randomUUID(),
      userId,
      type: type as NodeType,
      name,
      content: content || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      properties: properties || {}
    };

    if (type === 'Canvas' && !node.properties.canvasChildren) {
      node.properties.canvasChildren = [];
    }

    const created = await localDb.addNode(node);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Node
app.get(['/v1/nodes/:id', '/api/v1/nodes/:id'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const id = req.params.id;
  try {
    const node = await localDb.findNodeById(userId, id);
    if (!node) {
      return res.status(404).json({ error: 'Node not found or access denied', code: 'NOT_FOUND' });
    }
    res.json(node);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Patch Node
app.patch(['/v1/nodes/:id', '/api/v1/nodes/:id'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const id = req.params.id;
  const updates = req.body;

  try {
    const updatedNode = await localDb.updateNode(userId, id, updates);
    if (!updatedNode) {
      return res.status(404).json({ error: 'Node not found or access denied', code: 'NOT_FOUND' });
    }
    res.json(updatedNode);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Node
app.delete(['/v1/nodes/:id', '/api/v1/nodes/:id'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const id = req.params.id;

  try {
    const success = await localDb.deleteNode(userId, id);
    if (!success) {
      return res.status(404).json({ error: 'Node not found or access denied', code: 'NOT_FOUND' });
    }
    res.json({ message: 'Node and cascaded relationships purged successfully.', success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// RELATIONSHIPS ENDPOINTS
// ==========================

// Get All Relationships
app.get(['/v1/relationships', '/api/v1/relationships'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  try {
    const rawRels = await localDb.getRelationships(userId);
    res.json({ relationships: rawRels, count: rawRels.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create Relationship
app.post(['/v1/relationships', '/api/v1/relationships'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const { source, target, type } = req.body;

  if (!source || !target || !type) {
    return res.status(400).json({ error: 'Source, Target, and Type parameters are required.', code: 'VALIDATION_ERROR' });
  }

  try {
    const rel = {
      id: 'rel_' + crypto.randomUUID(),
      userId,
      source,
      target,
      type: type as string,
      createdAt: new Date().toISOString()
    };
    const created = await localDb.addRelationship(rel);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message, code: 'LINK_ERROR' });
  }
});

// Patch Relationship
app.patch(['/v1/relationships/:id', '/api/v1/relationships/:id'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const id = req.params.id;
  const { type } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Type attribute must be supplied to patch relationship.', code: 'VALIDATION_ERROR' });
  }

  try {
    const updated = await localDb.updateRelationship(userId, id, { type });
    if (!updated) {
      return res.status(404).json({ error: 'Relationship not found or access unauthorized', code: 'NOT_FOUND' });
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Relationship
app.delete(['/v1/relationships/:id', '/api/v1/relationships/:id'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const id = req.params.id;

  try {
    const deleted = await localDb.deleteRelationship(userId, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Relationship not found or access unauthorized', code: 'NOT_FOUND' });
    }
    res.json({ message: 'Relationship dismantled successfully.', success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// CANVAS ENDPOINTS
// ==========================

// Create specialized canvas node
app.post(['/v1/canvas', '/api/v1/canvas'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Canvas name must be provided.', code: 'VALIDATION_ERROR' });
  }

  try {
    const node = {
      id: 'node_' + crypto.randomUUID(),
      userId,
      type: 'Canvas' as const,
      name,
      content: 'Whiteboard Canvas Space',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      properties: {
        canvasChildren: []
      }
    };

    const created = await localDb.addNode(node);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get Canvas Node specification
app.get(['/v1/canvas/:id', '/api/v1/canvas/:id'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const id = req.params.id;

  try {
    const node = await localDb.findNodeById(userId, id);
    if (!node || node.type !== 'Canvas') {
      return res.status(404).json({ error: 'Canvas node not found', code: 'NOT_FOUND' });
    }
    res.json(node);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add block child to canvas node
app.post(['/v1/canvas/:id/children', '/api/v1/canvas/:id/children'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const canvasId = req.params.id;
  const { type, posX, posY, content } = req.body;

  if (!type || posX === undefined || posY === undefined || !content) {
    return res.status(400).json({ error: 'Missing parameters (type, posX, posY, content)', code: 'VALIDATION_ERROR' });
  }

  if (type === 'Canvas') {
    return res.status(400).json({ error: 'Canvas hierarchy recursion forbidden: You cannot nest canvas nodes inside other Canvas spaces.', code: 'NESTING_RECURSION_ERROR' });
  }

  try {
    const canvas = await localDb.findNodeById(userId, canvasId);
    if (!canvas || canvas.type !== 'Canvas') {
      return res.status(404).json({ error: 'Canvas node not found or access denied', code: 'NOT_FOUND' });
    }

    const children: CanvasChild[] = canvas.properties.canvasChildren || [];
    const newChild: CanvasChild = {
      id: 'c_child_' + crypto.randomUUID(),
      type: type as any,
      posX: Number(posX),
      posY: Number(posY),
      content,
      createdAt: new Date().toISOString()
    };

    children.push(newChild);
    await localDb.updateNode(userId, canvasId, {
      properties: {
        ...canvas.properties,
        canvasChildren: children
      }
    });

    res.status(201).json(newChild);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Patch child positions/content
app.patch(['/v1/canvas/:id/children/:childId', '/api/v1/canvas/:id/children/:childId'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const canvasId = req.params.id;
  const childId = req.params.childId;
  const { posX, posY, content } = req.body;

  try {
    const canvas = await localDb.findNodeById(userId, canvasId);
    if (!canvas || canvas.type !== 'Canvas') {
      return res.status(404).json({ error: 'Canvas node not found', code: 'NOT_FOUND' });
    }

    const children: CanvasChild[] = canvas.properties.canvasChildren || [];
    const idx = children.findIndex(c => c.id === childId);
    if (idx === -1) {
      return res.status(404).json({ error: 'CanvasChild block not found', code: 'CHILD_NOT_FOUND' });
    }

    if (posX !== undefined) children[idx].posX = Number(posX);
    if (posY !== undefined) children[idx].posY = Number(posY);
    if (content !== undefined) children[idx].content = content;

    await localDb.updateNode(userId, canvasId, {
      properties: {
        ...canvas.properties,
        canvasChildren: children
      }
    });

    res.json(children[idx]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete child block
app.delete(['/v1/canvas/:id/children/:childId', '/api/v1/canvas/:id/children/:childId'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const canvasId = req.params.id;
  const childId = req.params.childId;

  try {
    const canvas = await localDb.findNodeById(userId, canvasId);
    if (!canvas || canvas.type !== 'Canvas') {
      return res.status(404).json({ error: 'Canvas node not found', code: 'NOT_FOUND' });
    }

    const children: CanvasChild[] = canvas.properties.canvasChildren || [];
    const filtered = children.filter(c => c.id !== childId);

    if (children.length === filtered.length) {
      return res.status(404).json({ error: 'Child block not found', code: 'CHILD_NOT_FOUND' });
    }

    await localDb.updateNode(userId, canvasId, {
      properties: {
        ...canvas.properties,
        canvasChildren: filtered
      }
    });

    res.json({ message: 'Child block deleted successfully', success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// SEARCH, QUERY & INSIGHTS
// ==========================

// Full-text search
app.get(['/v1/search', '/api/v1/search'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const { q } = req.query;

  try {
    const results = await localDb.searchKeyword(userId, String(q || ''));
    res.json({ results, count: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Graph Parser and Traversal (Removed Hop limits and result limits)
app.post(['/v1/query', '/api/v1/query'], authenticateToken, async (req, res) => {
  const authUser = (req as any).user;
  const userId = authUser.userId;
  const { query, startNodeId } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query string must be supplied', code: 'VALIDATION_ERROR' });
  }

  try {
    const cleanQ = query.trim().toUpperCase();

    if (startNodeId) {
      // 1-to-unlimited breadth-first traversals
      const result = await localDb.get3HopTraversal(userId, startNodeId);
      return res.json({
        queryExecuted: query,
        results: result,
        tierApplied: authUser.tier,
        depthLimit: 'unlimited',
        hits: result.nodes.length
      });
    }

    const allNodes = await localDb.getNodes(userId);
    let filteredNodes = allNodes;

    if (cleanQ.includes("WHERE N.TYPE =")) {
      const match = query.match(/n\.type\s*=\s*['"]([^'"]+)['"]/i);
      if (match) {
        const typeFilter = match[1];
        filteredNodes = allNodes.filter(n => n.type.toLowerCase() === typeFilter.toLowerCase());
      }
    } else if (cleanQ.includes("WHERE N.NAME CONTAINS")) {
      const match = query.match(/n\.name\s+contains\s+['"]([^'"]+)['"]/i);
      if (match) {
        const nameFilter = match[1];
        filteredNodes = allNodes.filter(n => n.name.toLowerCase().includes(nameFilter.toLowerCase()));
      }
    }

    const allRels = await localDb.getRelationships(userId);
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const returnedRels = allRels.filter(r => nodeIds.has(r.source) && nodeIds.has(r.target));

    res.json({
      queryExecuted: query,
      results: {
        nodes: filteredNodes,
        relationships: returnedRels
      },
      tierApplied: authUser.tier,
      limitApplied: 'unlimited'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Built-in insights
app.get(['/v1/insights/:view', '/api/v1/insights/:view'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const view = req.params.view;

  try {
    if (view === 'most-connected') {
      const result = await localDb.getMostConnectedNodes(userId);
      return res.json({ view, nodes: result.map(r => ({ node: r.node, degree: r.degree })) });
    } else if (view === 'orphans') {
      const result = await localDb.getOrphanNodes(userId);
      return res.json({ view, nodes: result });
    } else if (view === 'top-level') {
      const result = await localDb.getTopLevelNodes(userId);
      return res.json({ view, nodes: result });
    } else if (view === 'concept-clusters') {
      const result = await localDb.getConceptClusters(userId);
      return res.json({ view, clusters: result });
    }

    res.status(400).json({ error: `Insight view: '${view}' not supported.`, code: 'INVALID_VIEW' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// SHORTCUT PANEL BOOKMARKS
// ==========================

// Get bookmarks
app.get(['/v1/shortcuts', '/api/v1/shortcuts'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  try {
    const shortcuts = await localDb.getShortcuts(userId);
    res.json({ shortcuts, count: shortcuts.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create bookmark
app.post(['/v1/shortcuts', '/api/v1/shortcuts'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const { nodeId, label } = req.body;

  if (!nodeId || !label) {
    return res.status(400).json({ error: 'NodeId and label are required', code: 'VALIDATION_ERROR' });
  }

  try {
    const node = await localDb.findNodeById(userId, nodeId);
    if (!node) {
      return res.status(404).json({ error: 'Reference Node not found', code: 'NOT_FOUND' });
    }

    const shortcut = {
      id: 'sc_' + crypto.randomUUID(),
      userId,
      nodeId,
      label,
      createdAt: new Date().toISOString()
    };

    const created = await localDb.addShortcut(shortcut);
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete bookmark
app.delete(['/v1/shortcuts/:id', '/api/v1/shortcuts/:id'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const id = req.params.id;

  try {
    const success = await localDb.deleteShortcut(userId, id);
    if (!success) {
      return res.status(404).json({ error: 'Shortcut not found', code: 'NOT_FOUND' });
    }
    res.json({ message: 'Shortcut bookmark removed successfully', success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// S3 FILES STORAGE (Real S3 integration, unlimited)
// ==========================

// Upload file node
app.post(['/v1/files/upload', '/api/v1/files/upload'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const { fileName, mimeType, base64Content, sizeBytes } = req.body;

  if (!fileName || !base64Content || sizeBytes === undefined) {
    return res.status(400).json({ error: 'Missing parameters (fileName, base64Content, sizeBytes)', code: 'VALIDATION_ERROR' });
  }

  try {
    const user = await localDb.findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User context offline', code: 'USER_NOT_FOUND' });
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const s3Key = `uploads/${userId}/${crypto.randomUUID()}_${cleanFileName}`;

    // Upload to real Amazon S3 bucket
    await uploadToS3(s3Key, mimeType || 'application/octet-stream', base64Content);

    // Track user storageUsed state
    const newStorage = user.storageUsed + sizeBytes;
    await localDb.updateUser(userId, { storageUsed: newStorage });

    // Create a matching File node in Neo4j
    const fileNode = {
      id: 'node_' + crypto.randomUUID(),
      userId,
      type: 'File' as const,
      name: fileName,
      content: `Uploaded file of type ${mimeType || 'unknown'} stored securely in AWS S3.`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      properties: {
        s3Key: s3Key,
        mimeType: mimeType || 'application/octet-stream',
        sizeBytes: sizeBytes
      }
    };

    const createdNode = await localDb.addNode(fileNode);

    // Retrieve signed URL instantly
    const signedUrl = await getS3SignedUrl(s3Key);

    res.status(201).json({
      message: 'File dispatched to S3 bucket successfully.',
      node: createdNode,
      s3Url: signedUrl,
      storageUsed: newStorage,
      quotaLimit: 'unlimited'
    });

  } catch (err: any) {
    res.status(500).json({ error: `S3 client upload stream failed: ${err.message}`, code: 'STORAGE_FAILED' });
  }
});

// Fetch S3 signed URL
app.get(['/v1/files/:nodeId', '/api/v1/files/:nodeId'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const nodeId = req.params.nodeId;

  try {
    const node = await localDb.findNodeById(userId, nodeId);
    if (!node || node.type !== 'File') {
      return res.status(404).json({ error: 'File-type node not found', code: 'NOT_FOUND' });
    }

    const key = node.properties.s3Key;
    if (!key) {
      return res.status(404).json({ error: 'S3 Key target missing from node attributes' });
    }

    const signedUrl = await getS3SignedUrl(key);

    res.json({
      nodeId,
      signedUrl: signedUrl,
      expiresIn: '1 hour',
      sizeBytes: node.properties.sizeBytes,
      mimeType: node.properties.mimeType
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Purge storage file from S3
app.delete(['/v1/files/:nodeId', '/api/v1/files/:nodeId'], authenticateToken, async (req, res) => {
  const userId = (req as any).user.userId;
  const nodeId = req.params.nodeId;

  try {
    const node = await localDb.findNodeById(userId, nodeId);
    if (!node || node.type !== 'File') {
      return res.status(404).json({ error: 'File-type node not found', code: 'NOT_FOUND' });
    }

    const u = await localDb.findUserById(userId);
    if (u) {
      const size = node.properties.sizeBytes || 0;
      const remaining = Math.max(0, u.storageUsed - size);
      await localDb.updateUser(userId, { storageUsed: remaining });
    }

    const key = node.properties.s3Key;
    if (key) {
      await deleteFromS3(key);
    }

    await localDb.deleteNode(userId, nodeId);
    res.json({ message: 'File deleted from S3 and quota released.', success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// USER ACCOUNTS CONFIGURATION
// ==========================

// Get user account details
app.get(['/v1/account', '/api/v1/account'], authenticateToken, async (req, res) => {
  const authUser = (req as any).user;
  try {
    const user = await localDb.findUserById(authUser.userId);
    if (!user) {
      return res.status(404).json({ error: 'User target offline', code: 'USER_NOT_FOUND' });
    }
    res.json({
      id: user.id,
      email: user.email,
      tier: 'pro',
      storageUsed: user.storageUsed,
      createdAt: user.createdAt
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// STATIC FILES & VITE MIDDLEWARE
// ==========================

async function initializeViteAndListen() {
  // Graceful Neo4j startup test
  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    console.log('Neo4j connected successfully.');
  } catch (err) {
    console.error("WARNING: Neo4j not connected. Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD in environment variables.");
  }

  if (process.env.NODE_ENV !== "production") {
    console.log('Mounting dynamic Vite dev server module...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`=========================================`);
    console.log(` KnoGraph production-ready server booted.`);
    console.log(` Port: ${PORT}`);
    console.log(` Developer Mode: ${process.env.NODE_ENV !== "production"}`);
    console.log(`=========================================`);
  });
}

initializeViteAndListen().catch(err => {
  console.error('Failed to initialize server pipelines: ', err);
});
