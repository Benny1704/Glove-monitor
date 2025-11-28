import { generateUUID } from '../utils/uuid';

/**
 * Save a blob to the Origin Private File System (OPFS)
 */
export async function saveFileToOPFS(blob: Blob, extension: string): Promise<string> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileName = `${generateUUID()}.${extension}`;
    const fileHandle = await root.getFileHandle(fileName, { create: true });
    
    // Create a writable stream to the file
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    
    return fileName;
  } catch (error) {
    console.error('Error saving to OPFS:', error);
    throw new Error('Failed to save file to storage');
  }
}

/**
 * Retrieve a file from OPFS as a Blob
 */
export async function getFileFromOPFS(fileName: string): Promise<Blob> {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName);
    return await fileHandle.getFile();
  } catch (error) {
    console.error(`Error reading file ${fileName} from OPFS:`, error);
    throw new Error(`File not found: ${fileName}`);
  }
}

/**
 * Delete a file from OPFS
 */
export async function deleteFileFromOPFS(fileName: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(fileName);
  } catch (error) {
    // Ignore error if file doesn't exist, it might have been cleaned up already
    console.warn(`Could not delete ${fileName} (might not exist):`, error);
  }
}

/**
 * Wipe all files from OPFS
 */
export async function clearOPFS(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  // @ts-expect-error - values() iterator support varies across browsers
  for await (const entry of root.values()) {
    await root.removeEntry(entry.name);
  }
}