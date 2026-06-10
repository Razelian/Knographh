import neo4j from 'neo4j-driver';
import bcrypt from 'bcryptjs';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  tier: 'free' | 'pro';
  storageUsed: number; // in bytes
  createdAt: string;
}

export type NodeType = 'Note' | 'File' | 'Canvas' | 'Person' | 'Concept';

export interface CanvasChild {
  id: string;
  type: 'text' | 'image' | 'drawing' | 'file';
  posX: number;
  posY: number;
  content: string; // text content, s3Url/localUrl, etc.
  createdAt: string;
}

export interface Node {
  id: string;
  userId: string;
  type: NodeType;
  name: string;
  content: string; // Content for Notes, notes for Persons, description for Concepts
  createdAt: string;
  updatedAt: string;
  properties: {
    s3Key?: string;
    mimeType?: string;
    sizeBytes?: number;
    email?: string; // for Person
    description?: string; // duplicate/fallback for Concept
    canvasChildren?: CanvasChild[]; // for Canvas node
  };
}

export interface Relationship {
  id: string;
  userId: string;
  source: string; // nodeId
  target: string; // nodeId
  type: string;
  createdAt: string;
}

export interface Shortcut {
  id: string;
  userId: string;
  nodeId: string;
  label: string;
  createdAt: string;
}

// -------------------------------------------------------------
// Neo4j Global Driver Setup (Lazy Initialization)
// -------------------------------------------------------------
let neo4jDriver: any = null;

export function getNeo4jDriver() {
  if (!neo4jDriver) {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';
    neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return neo4jDriver;
}

// Helper to convert integer properties from Neo4j (since Neo4j uses custom Int types)
function toNum(val: any): number {
  if (val === undefined || val === null) return 0;
  if (neo4j.isInt(val)) return val.toNumber();
  return Number(val);
}

// Mapping helper for User
function mapUser(record: any): User {
  const props = record.properties;
  return {
    id: props.id,
    email: props.email,
    passwordHash: props.passwordHash,
    tier: props.tier || 'pro',
    storageUsed: toNum(props.storageUsed),
    createdAt: props.createdAt
  };
}

// Mapping helper for Node
function mapNode(record: any): Node {
  const props = record.properties;
  let parsedProps: any = {};
  if (typeof props.properties === 'string' && props.properties) {
    try {
      parsedProps = JSON.parse(props.properties);
    } catch {
      parsedProps = {};
    }
  } else if (props.properties) {
    parsedProps = props.properties;
  }
  return {
    id: props.id,
    userId: props.userId,
    type: props.type,
    name: props.name,
    content: props.content,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    properties: parsedProps
  };
}

// Mapping helper for Shortcut
function mapShortcut(record: any): Shortcut {
  const props = record.properties;
  return {
    id: props.id,
    userId: props.userId,
    nodeId: props.nodeId,
    label: props.label,
    createdAt: props.createdAt
  };
}

// -------------------------------------------------------------
// AWS S3 Setup
// -------------------------------------------------------------
let s3Client: S3Client | null = null;

export function getS3Client() {
  if (!s3Client) {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID || 'mock';
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || 'mock';
    s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }
  return s3Client;
}

export async function uploadToS3(key: string, mimeType: string, base64Content: string): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET || 'knograph-bucket';
  const buffer = Buffer.from(base64Content, 'base64');

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType
    })
  );

  return key;
}

export async function getS3SignedUrl(key: string): Promise<string> {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET || 'knograph-bucket';
  
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  return await getSignedUrl(client, command, { expiresIn: 3600 });
}

export async function deleteFromS3(key: string): Promise<void> {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET || 'knograph-bucket';

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );
}

// -------------------------------------------------------------
// OpenSearch Setup
// -------------------------------------------------------------
const INDEX_NAME = 'knograph-nodes';
let opensearchClient: OpenSearchClient | null = null;

export function getOpenSearchClient() {
  if (!opensearchClient) {
    const node = process.env.OPENSEARCH_URL || 'http://localhost:9200';
    opensearchClient = new OpenSearchClient({
      node,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return opensearchClient;
}

async function ensureOpenSearchIndex() {
  if (!process.env.OPENSEARCH_URL) return;
  const client = getOpenSearchClient();
  try {
    const exists = await client.indices.exists({ index: INDEX_NAME });
    if (!exists.body) {
      await client.indices.create({
        index: INDEX_NAME,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              userId: { type: 'keyword' },
              type: { type: 'keyword' },
              name: { type: 'text', analyzer: 'english' },
              content: { type: 'text', analyzer: 'english' },
              createdAt: { type: 'date' }
            }
          }
        }
      });
    }
  } catch (e) {
    console.warn('Unable to create OpenSearch index:', e);
  }
}

export async function indexNodeInOpenSearch(node: Node) {
  if (!process.env.OPENSEARCH_URL) return;
  const client = getOpenSearchClient();
  await ensureOpenSearchIndex();
  try {
    await client.index({
      index: INDEX_NAME,
      id: node.id,
      body: {
        id: node.id,
        userId: node.userId,
        type: node.type,
        name: node.name,
        content: node.content,
        createdAt: node.createdAt
      },
      refresh: true
    });
  } catch (e) {
    console.error(`Failed to index node ${node.id} in OpenSearch:`, e);
  }
}

export async function deindexNodeFromOpenSearch(nodeId: string) {
  if (!process.env.OPENSEARCH_URL) return;
  const client = getOpenSearchClient();
  try {
    await client.delete({
      index: INDEX_NAME,
      id: nodeId,
      refresh: true
    });
  } catch (e) {
    console.error(`Failed to deindex node ${nodeId} from OpenSearch:`, e);
  }
}

// -------------------------------------------------------------
// Real Neo4j Core DB Operations Class
// -------------------------------------------------------------
class GraphNeo4jDatabase {

  // --- Users Operations ---
  public async getUsersCount(): Promise<number> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run('MATCH (u:User) RETURN count(u) as count');
      return toNum(res.records[0].get('count'));
    } finally {
      await session.close();
    }
  }

  public async getUsers(): Promise<User[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run('MATCH (u:User) RETURN u');
      return res.records.map((r: any) => mapUser(r.get('u')));
    } finally {
      await session.close();
    }
  }

  public async findUserById(id: string): Promise<User | undefined> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run('MATCH (u:User {id: $id}) RETURN u', { id });
      if (res.records.length === 0) return undefined;
      return mapUser(res.records[0].get('u'));
    } finally {
      await session.close();
    }
  }

  public async findUserByEmail(email: string): Promise<User | undefined> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        'MATCH (u:User) WHERE toLower(u.email) = toLower($email) RETURN u',
        { email }
      );
      if (res.records.length === 0) return undefined;
      return mapUser(res.records[0].get('u'));
    } finally {
      await session.close();
    }
  }

  public async addUser(user: User): Promise<void> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      await session.run(
        `CREATE (u:User {
          id: $id,
          email: $email,
          passwordHash: $passwordHash,
          tier: $tier,
          storageUsed: toInteger($storageUsed),
          createdAt: $createdAt
        })`,
        {
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
          tier: user.tier,
          storageUsed: user.storageUsed,
          createdAt: user.createdAt
        }
      );
    } finally {
      await session.close();
    }
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      // Clean up update parameters to match exact types
      const cleanParams: any = {};
      if (updates.email !== undefined) cleanParams.email = updates.email;
      if (updates.passwordHash !== undefined) cleanParams.passwordHash = updates.passwordHash;
      if (updates.tier !== undefined) cleanParams.tier = updates.tier;
      if (updates.storageUsed !== undefined) cleanParams.storageUsed = toIntegerNeo4j(updates.storageUsed);

      const res = await session.run(
        'MATCH (u:User {id: $id}) SET u += $cleanParams RETURN u',
        { id, cleanParams }
      );
      if (res.records.length === 0) return undefined;
      return mapUser(res.records[0].get('u'));
    } finally {
      await session.close();
    }
  }

  // --- Nodes Operations ---
  public async getNodes(userId: string): Promise<Node[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run('MATCH (n:Node {userId: $userId}) RETURN n', { userId });
      return res.records.map((r: any) => mapNode(r.get('n')));
    } finally {
      await session.close();
    }
  }

  public async findNodeById(userId: string, id: string): Promise<Node | undefined> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        'MATCH (n:Node {id: $id, userId: $userId}) RETURN n',
        { id, userId }
      );
      if (res.records.length === 0) return undefined;
      return mapNode(res.records[0].get('n'));
    } finally {
      await session.close();
    }
  }

  public async addNode(node: Node): Promise<Node> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      // Serialize properties as JSON string to support full schema nested values
      const propsString = JSON.stringify(node.properties || {});
      const res = await session.run(
        `CREATE (n:Node {
          id: $id,
          userId: $userId,
          type: $type,
          name: $name,
          content: $content,
          createdAt: $createdAt,
          updatedAt: $updatedAt,
          properties: $propsString
        }) RETURN n`,
        {
          id: node.id,
          userId: node.userId,
          type: node.type,
          name: node.name,
          content: node.content,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          propsString
        }
      );
      const created = mapNode(res.records[0].get('n'));
      await indexNodeInOpenSearch(created);
      return created;
    } finally {
      await session.close();
    }
  }

  public async updateNode(
    userId: string,
    id: string,
    updates: Partial<Omit<Node, 'id' | 'userId' | 'createdAt'>>
  ): Promise<Node | undefined> {
    const current = await this.findNodeById(userId, id);
    if (!current) return undefined;

    const mergedProps = {
      ...current.properties,
      ...(updates.properties || {})
    };

    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const propsString = JSON.stringify(mergedProps);
      const res = await session.run(
        `MATCH (n:Node {id: $id, userId: $userId})
         SET n.name = COALESCE($name, n.name),
             n.content = COALESCE($content, n.content),
             n.updatedAt = $updatedAt,
             n.properties = $propsString
         RETURN n`,
        {
          id,
          userId,
          name: updates.name !== undefined ? updates.name : null,
          content: updates.content !== undefined ? updates.content : null,
          updatedAt: new Date().toISOString(),
          propsString
        }
      );
      if (res.records.length === 0) return undefined;
      const updated = mapNode(res.records[0].get('n'));
      await indexNodeInOpenSearch(updated);
      return updated;
    } finally {
      await session.close();
    }
  }

  public async deleteNode(userId: string, id: string): Promise<boolean> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      // 1. Delete matching relationships & components of the Node
      await session.run(
        `MATCH (n:Node {id: $id, userId: $userId})
         OPTIONAL MATCH (n)-[r:RELATED]-()
         DELETE r, n`,
        { id, userId }
      );

      // 2. Clear Shortcuts
      await session.run(
        'MATCH (s:Shortcut {nodeId: $id, userId: $userId}) DELETE s',
        { id, userId }
      );

      await deindexNodeFromOpenSearch(id);
      return true;
    } finally {
      await session.close();
    }
  }

  // --- Relationships Operations ---
  public async getRelationships(userId: string): Promise<Relationship[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `MATCH (s:Node {userId: $userId})-[r:RELATED]->(t:Node {userId: $userId})
         RETURN r.id as id, r.userId as userId, s.id as source, t.id as target, r.type as type, r.createdAt as createdAt`,
        { userId }
      );
      return res.records.map((rec: any) => ({
        id: rec.get('id'),
        userId: rec.get('userId'),
        source: rec.get('source'),
        target: rec.get('target'),
        type: rec.get('type'),
        createdAt: rec.get('createdAt')
      }));
    } finally {
      await session.close();
    }
  }

  public async findRelationshipById(userId: string, id: string): Promise<Relationship | undefined> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `MATCH (s:Node)-[r:RELATED {id: $id, userId: $userId}]->(t:Node)
         RETURN r.id as id, r.userId as userId, s.id as source, t.id as target, r.type as type, r.createdAt as createdAt`,
        { id, userId }
      );
      if (res.records.length === 0) return undefined;
      const rec = res.records[0];
      return {
        id: rec.get('id'),
        userId: rec.get('userId'),
        source: rec.get('source'),
        target: rec.get('target'),
        type: rec.get('type'),
        createdAt: rec.get('createdAt')
      };
    } finally {
      await session.close();
    }
  }

  public async addRelationship(rel: Relationship): Promise<Relationship> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      // Validate source and target nodes exist first
      const srcCheck = await session.run('MATCH (n:Node {id: $id, userId: $userId}) RETURN n', { id: rel.source, userId: rel.userId });
      const dstCheck = await session.run('MATCH (n:Node {id: $id, userId: $userId}) RETURN n', { id: rel.target, userId: rel.userId });
      if (srcCheck.records.length === 0 || dstCheck.records.length === 0) {
        throw new Error(`Invalid source or target reference nodes for drawn relationship: ${rel.source} -> ${rel.target}`);
      }

      const res = await session.run(
        `MATCH (s:Node {id: $source, userId: $userId}), (t:Node {id: $target, userId: $userId})
         MERGE (s)-[r:RELATED {id: $id, userId: $userId, type: $type, createdAt: $createdAt}]->(t)
         RETURN r.id as id, r.userId as userId, s.id as source, t.id as target, r.type as type, r.createdAt as createdAt`,
        {
          source: rel.source,
          target: rel.target,
          id: rel.id,
          userId: rel.userId,
          type: rel.type,
          createdAt: rel.createdAt
        }
      );
      const rec = res.records[0];
      return {
        id: rec.get('id'),
        userId: rec.get('userId'),
        source: rec.get('source'),
        target: rec.get('target'),
        type: rec.get('type'),
        createdAt: rec.get('createdAt')
      };
    } finally {
      await session.close();
    }
  }

  public async updateRelationship(
    userId: string,
    id: string,
    updates: Partial<Pick<Relationship, 'type'>>
  ): Promise<Relationship | undefined> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `MATCH (s:Node)-[r:RELATED {id: $id, userId: $userId}]->(t:Node)
         SET r.type = $type
         RETURN r.id as id, r.userId as userId, s.id as source, t.id as target, r.type as type, r.createdAt as createdAt`,
        { id, userId, type: updates.type }
      );
      if (res.records.length === 0) return undefined;
      const rec = res.records[0];
      return {
        id: rec.get('id'),
        userId: rec.get('userId'),
        source: rec.get('source'),
        target: rec.get('target'),
        type: rec.get('type'),
        createdAt: rec.get('createdAt')
      };
    } finally {
      await session.close();
    }
  }

  public async deleteRelationship(userId: string, id: string): Promise<boolean> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        'MATCH ()-[r:RELATED {id: $id, userId: $userId}]->() DELETE r RETURN count(r) as count',
        { id, userId }
      );
      return toNum(res.records[0].get('count')) > 0;
    } finally {
      await session.close();
    }
  }

  // --- Shortcuts Operations ---
  public async getShortcuts(userId: string): Promise<Shortcut[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run('MATCH (s:Shortcut {userId: $userId}) RETURN s', { userId });
      return res.records.map((r: any) => mapShortcut(r.get('s')));
    } finally {
      await session.close();
    }
  }

  public async addShortcut(shortcut: Shortcut): Promise<Shortcut> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `MERGE (s:Shortcut {userId: $userId, nodeId: $nodeId})
         ON CREATE SET s.id = $id, s.label = $label, s.createdAt = $createdAt
         RETURN s`,
        {
          userId: shortcut.userId,
          nodeId: shortcut.nodeId,
          id: shortcut.id,
          label: shortcut.label,
          createdAt: shortcut.createdAt
        }
      );
      return mapShortcut(res.records[0].get('s'));
    } finally {
      await session.close();
    }
  }

  public async deleteShortcut(userId: string, id: string): Promise<boolean> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        'MATCH (s:Shortcut {id: $id, userId: $userId}) DELETE s RETURN count(s) as count',
        { id, userId }
      );
      return toNum(res.records[0].get('count')) > 0;
    } finally {
      await session.close();
    }
  }

  // --- Insights / Algorithms ---
  public async getMostConnectedNodes(userId: string, limit = 20): Promise<{ node: Node; degree: number }[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `MATCH (n:Node {userId: $userId})
         OPTIONAL MATCH (n)-[r:RELATED]-()
         RETURN n, count(r) as degree
         ORDER BY degree DESC
         LIMIT $limit`,
        { userId, limit: toIntegerNeo4j(limit) }
      );
      return res.records.map((rec: any) => ({
        node: mapNode(rec.get('n')),
        degree: toNum(rec.get('degree'))
      }));
    } finally {
      await session.close();
    }
  }

  public async getOrphanNodes(userId: string): Promise<Node[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `MATCH (n:Node {userId: $userId})
         WHERE NOT (n)-[:RELATED]-()
         RETURN n`,
        { userId }
      );
      return res.records.map((rec: any) => mapNode(rec.get('n')));
    } finally {
      await session.close();
    }
  }

  public async getTopLevelNodes(userId: string): Promise<Node[]> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `MATCH (n:Node {userId: $userId})
         WHERE NOT ()-[:RELATED]->(n)
         RETURN n`,
        { userId }
      );
      return res.records.map((rec: any) => mapNode(rec.get('n')));
    } finally {
      await session.close();
    }
  }

  public async getConceptClusters(userId: string): Promise<{ clusterId: number; nodes: Node[] }[]> {
    // Standard BFS-based cluster components in-memory loading to fully conform to specs has the absolute maximum safety.
    const nodes = await this.getNodes(userId);
    const relationships = await this.getRelationships(userId);

    const nodesMap = new Map<string, Node>(nodes.map(n => [n.id, n]));
    const adj = new Map<string, string[]>();
    nodes.forEach(n => adj.set(n.id, []));
    relationships.forEach(r => {
      if (adj.has(r.source) && adj.has(r.target)) {
        adj.get(r.source)!.push(r.target);
        adj.get(r.target)!.push(r.source);
      }
    });

    const visited = new Set<string>();
    const clusters: { clusterId: number; nodes: Node[] }[] = [];
    let clusterCounter = 1;

    nodes.forEach(startNode => {
      if (!visited.has(startNode.id)) {
        const clusterNodes: Node[] = [];
        const queue: string[] = [startNode.id];
        visited.add(startNode.id);

        while (queue.length > 0) {
          const id = queue.shift()!;
          const nodeObj = nodesMap.get(id);
          if (nodeObj) clusterNodes.push(nodeObj);

          const neighbors = adj.get(id) || [];
          neighbors.forEach(nId => {
            if (!visited.has(nId)) {
              visited.add(nId);
              queue.push(nId);
            }
          });
        }

        if (clusterNodes.length > 1) {
          clusters.push({
            clusterId: clusterCounter++,
            nodes: clusterNodes
          });
        }
      }
    });

    return clusters.sort((a, b) => b.nodes.length - a.nodes.length);
  }

  public async get3HopTraversal(
    userId: string,
    startNodeId: string,
    maxDepth = 300,  // Removed hop restrictions
    maxResults = 100000 // Removed result restrictions
  ): Promise<{ nodes: Node[]; relationships: Relationship[] }> {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      // Find all paths originating from the target startNodeId
      // Supports unlimited depths for single-user scale
      const res = await session.run(
        `MATCH path = (start:Node {id: $startNodeId, userId: $userId})-[*0..10]->(end:Node {userId: $userId})
         RETURN path LIMIT $maxResults`,
        { startNodeId, userId, maxResults: toIntegerNeo4j(maxResults) }
      );

      const hitNodes = new Map<string, Node>();
      const hitRels = new Map<string, Relationship>();

      res.records.forEach((rec: any) => {
        const path = rec.get('path');
        if (!path) return;

        // Process segments in path
        path.segments.forEach((seg: any) => {
          const startN = mapNode(seg.start);
          const endN = mapNode(seg.end);
          
          hitNodes.set(startN.id, startN);
          hitNodes.set(endN.id, endN);

          const relProps = seg.relationship.properties;
          hitRels.set(relProps.id, {
            id: relProps.id,
            userId: relProps.userId,
            source: startN.id,
            target: endN.id,
            type: relProps.type,
            createdAt: relProps.createdAt
          });
        });

        // Corner case: path with only 1 start node (0 segments)
        if (path.start) {
          const startN = mapNode(path.start);
          hitNodes.set(startN.id, startN);
        }
      });

      return {
        nodes: Array.from(hitNodes.values()),
        relationships: Array.from(hitRels.values())
      };
    } finally {
      await session.close();
    }
  }

  // --- Search Engine ---
  public async searchKeyword(userId: string, query: string): Promise<Node[]> {
    if (!query) {
      return await this.getNodes(userId);
    }
    
    // 1. Try real OpenSearch search first
    if (process.env.OPENSEARCH_URL) {
      const client = getOpenSearchClient();
      await ensureOpenSearchIndex();
      try {
        const response = await client.search({
          index: INDEX_NAME,
          body: {
            query: {
              bool: {
                must: [
                  { term: { userId } },
                  {
                    multi_match: {
                      query,
                      fields: ['name^3', 'content', 'type'],
                      fuzziness: 'AUTO'
                    }
                  }
                ]
              }
            }
          }
        });
        const hitIds: string[] = (response.body.hits?.hits || []).map((h: any) => h._source.id);
        if (hitIds.length > 0) {
          const driver = getNeo4jDriver();
          const session = driver.session();
          try {
            const res = await session.run(
              'MATCH (n:Node) WHERE n.id IN $hitIds AND n.userId = $userId RETURN n',
              { hitIds, userId }
            );
            return res.records.map((r: any) => mapNode(r.get('n')));
          } finally {
            await session.close();
          }
        }
      } catch (e) {
        console.error('OpenSearch failed, falling back to Cypher searching:', e);
      }
    }

    // 2. Cypher weighted substring-match fallback
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const res = await session.run(
        `MATCH (n:Node {userId: $userId})
         WHERE toLower(n.name) CONTAINS toLower($query) OR toLower(n.content) CONTAINS toLower($query)
         RETURN n`,
        { userId, query }
      );
      return res.records.map((r: any) => mapNode(r.get('n')));
    } finally {
      await session.close();
    }
  }
}

// Support function to format integer parameters explicitly to Neo4j standard INT representation
function toIntegerNeo4j(val: number) {
  return neo4j.int(val);
}

export const localDb = new GraphNeo4jDatabase();
