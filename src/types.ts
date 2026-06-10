export type NodeType = 'Note' | 'File' | 'Canvas' | 'Person' | 'Concept';

export interface CanvasChild {
  id: string;
  type: 'text' | 'image' | 'drawing' | 'file';
  posX: number;
  posY: number;
  content: string;
  createdAt: string;
}

export interface Node {
  id: string;
  userId: string;
  type: NodeType;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  properties: {
    s3Key?: string;
    mimeType?: string;
    sizeBytes?: number;
    email?: string;
    description?: string;
    canvasChildren?: CanvasChild[];
  };
}

export interface Relationship {
  id: string;
  userId: string;
  source: string;
  target: string;
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

export interface User {
  id: string;
  email: string;
  storageUsed: number;
  createdAt: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}
