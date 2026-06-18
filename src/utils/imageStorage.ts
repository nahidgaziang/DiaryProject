import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

/**
 * Copies a temporary camera/gallery photo to a persistent app folder (`Directory.Data`)
 * and returns the relative path/filename.
 */
export async function saveEntryImage(entryId: string, tempUri: string): Promise<string> {
  try {
    // Generate a unique filename using timestamp
    const fileName = `entry_${entryId}_${Date.now()}.jpeg`;

    // Read the file from the temporary location
    // Note: the Camera plugin usually returns a webPath or path. We can use the path directly in Filesystem.readFile.
    // If tempUri is a capacitor:// or http:// URL (webPath), reading it might require fetch() or similar in browser.
    // However, on native Android/iOS, Filesystem.readFile works best with raw paths. 
    // Wait, let's use the safer base64 approach since we're crossing web/native boundaries if needed.
    
    // Actually, on native, we can read the file as base64 and write it back.
    // But since we want to be safe across environments, reading a blob and converting to base64 is one way.
    // Let's rely on fetch() for webPath, or native readFile for 'path'.
    
    let base64Data: string;
    
    if (tempUri.startsWith('http') || tempUri.startsWith('blob:') || tempUri.startsWith('capacitor://')) {
      const response = await fetch(tempUri);
      const blob = await response.blob();
      base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]); // remove data URL prefix
          } else {
            reject(new Error('Failed to convert blob to base64'));
          }
        };
        reader.readAsDataURL(blob);
      });
    } else {
      // Native raw path
      const file = await Filesystem.readFile({
        path: tempUri
      });
      base64Data = typeof file.data === 'string' ? file.data : Buffer.from(file.data as any).toString('base64');
    }

    // Write to persistent data directory
    await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data
    });

    return fileName;
  } catch (error) {
    console.error('Failed to save entry image:', error);
    throw error;
  }
}

/**
 * Converts a stored relative path/filename into a viewable source URL.
 */
export async function getEntryImageSrc(fileName: string): Promise<string> {
  try {
    const { uri } = await Filesystem.getUri({
      path: fileName,
      directory: Directory.Data
    });
    return Capacitor.convertFileSrc(uri);
  } catch (error) {
    console.error('Failed to get image URI for', fileName, error);
    return '';
  }
}

/**
 * Deletes the stored image file from the filesystem.
 */
export async function deleteEntryImage(fileName: string): Promise<void> {
  try {
    await Filesystem.deleteFile({
      path: fileName,
      directory: Directory.Data
    });
  } catch (error) {
    console.error('Failed to delete image file', fileName, error);
  }
}
