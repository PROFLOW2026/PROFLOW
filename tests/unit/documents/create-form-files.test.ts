import { describe, expect, it } from 'vitest';
import {
  CREATE_PHOTO_FIELD,
  MAX_CREATE_PHOTOS,
  collectCreatePhotoFiles,
} from '@/modules/documents/domain/create-form-files';

function jpeg(name: string, size = 8): File {
  return new File([new Uint8Array(size).fill(1)], name, { type: 'image/jpeg' });
}

describe('collectCreatePhotoFiles', () => {
  it('collects photo files from the create-form field and ignores empty entries', () => {
    const formData = new FormData();
    formData.append(CREATE_PHOTO_FIELD, jpeg('wall.jpg'));
    formData.append(CREATE_PHOTO_FIELD, jpeg('crack.jpg', 16));
    formData.append(CREATE_PHOTO_FIELD, new File([], 'empty.jpg', { type: 'image/jpeg' }));
    formData.set('summary', 'poured slab');

    expect(collectCreatePhotoFiles(formData).map((file) => file.name)).toEqual([
      'wall.jpg',
      'crack.jpg',
    ]);
  });

  it('caps staged photos', () => {
    const formData = new FormData();
    for (let i = 0; i < MAX_CREATE_PHOTOS + 3; i += 1) {
      formData.append(CREATE_PHOTO_FIELD, jpeg(`p-${i}.jpg`));
    }
    expect(collectCreatePhotoFiles(formData)).toHaveLength(MAX_CREATE_PHOTOS);
  });
});
