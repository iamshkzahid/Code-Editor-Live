/**
 * Code Editor Live V3.0 — Virtual Filesystem Controller
 * IndexedDB-backed filesystem using LightningFS.
 */
import LightningFS from '@isomorphic-git/lightning-fs';

type ChangeCallback = () => void;

export class VFSController {
  private fs!: LightningFS;
  private pfs!: LightningFS.PromisifiedFS;
  private listeners: ChangeCallback[] = [];

  async init(): Promise<void> {
    this.fs = new LightningFS('cel-fs-v3');
    this.pfs = this.fs.promises;
    // Ensure root directories exist
    await this.ensureDir('/');
  }

  private async ensureDir(path: string): Promise<void> {
    try {
      await this.pfs.stat(path);
    } catch {
      try {
        await this.pfs.mkdir(path);
      } catch { /* already exists */ }
    }
  }

  async readFile(path: string): Promise<string> {
    const data = await this.pfs.readFile(path, { encoding: 'utf8' });
    return data as string;
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Ensure parent directories exist
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (let i = 0; i < parts.length - 1; i++) {
      current += '/' + parts[i];
      await this.ensureDir(current);
    }
    await this.pfs.writeFile(path, content, 'utf8');
    this.notifyChange();
  }

  async deleteFile(path: string): Promise<void> {
    await this.pfs.unlink(path);
    this.notifyChange();
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const content = await this.readFile(oldPath);
    await this.writeFile(newPath, content);
    await this.deleteFile(oldPath);
  }

  async listFiles(dir: string): Promise<string[]> {
    const result: string[] = [];
    await this.walkDir(dir, result);
    return result.sort();
  }

  private async walkDir(dir: string, result: string[]): Promise<void> {
    let entries: string[];
    try {
      entries = (await this.pfs.readdir(dir)) as string[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = dir === '/' ? `/${entry}` : `${dir}/${entry}`;
      try {
        const stat = await this.pfs.stat(fullPath);
        if (stat.isDirectory()) {
          await this.walkDir(fullPath, result);
        } else {
          result.push(fullPath);
        }
      } catch { /* skip inaccessible */ }
    }
  }

  async readAllFiles(): Promise<Record<string, string>> {
    const files = await this.listFiles('/');
    const result: Record<string, string> = {};
    for (const file of files) {
      try {
        result[file] = await this.readFile(file);
      } catch { /* skip unreadable */ }
    }
    return result;
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await this.pfs.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  onChange(callback: ChangeCallback): void {
    this.listeners.push(callback);
  }

  private notifyChange(): void {
    for (const cb of this.listeners) {
      try { cb(); } catch { /* listener error — silent */ }
    }
  }
}
