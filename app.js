// ===========================
// Cloudinary Configuration
// ===========================
const CLOUDINARY_CLOUD_NAME = 'dvvyxvznt';  // Cloudinary cloud name
const CLOUDINARY_UPLOAD_PRESET = 'japan-archive';

// ===========================
// Default Sample Data
// ===========================
const DEFAULT_PHOTOS = [
  {
    id: 'default-1',
    date: '2026-02-05',
    location: '도쿄 신주쿠 골든가이',
    imageUrl: 'images/tokyo-alley.png',
    blogUrl: '',
    isDefault: true
  },
  {
    id: 'default-2',
    date: '2026-02-12',
    location: '교토 히가시야마 킷사텐',
    imageUrl: 'images/japan-cafe.png',
    blogUrl: '',
    isDefault: true
  },
  {
    id: 'default-3',
    date: '2026-02-20',
    location: '가와구치코 후지산',
    imageUrl: 'images/fuji-lake.png',
    blogUrl: '',
    isDefault: true
  }
];

// ===========================
// Admin Mode (URL Parameter)
// ===========================
const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';
if (!isAdmin) {
  document.body.classList.add('readonly-mode');
}

// ===========================
// State
// ===========================
let photos = [];
let activeFilter = 'all';
let currentSort = 'oldest'; // Default sort
let suppressOutsideClick = false;
let selectedFiles = []; // { file, dataUrl, name }

const VIEW_MODE_KEY = 'handalsal-view-mode';

// ===========================
// DOM Elements
// ===========================
const gallery = document.getElementById('gallery');
const tagsContainer = document.getElementById('tags');
const addBtn = document.getElementById('add-btn');
const uploadModal = document.getElementById('upload-modal');
const modalClose = document.getElementById('modal-close');
const uploadForm = document.getElementById('upload-form');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const viewListBtn = document.getElementById('view-list');
const viewGridBtn = document.getElementById('view-grid');

// ===========================
// Date Formatting
// ===========================
function formatDate(dateStr) {
  return dateStr.replace(/-/g, '.');
}

function formatDateJP(dateStr) {
  const d = new Date(dateStr);
  const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  return `${d.getFullYear()}年 ${months[d.getMonth()]} ${d.getDate()}日`;
}

// ===========================
// Firebase: Seed Default Data
// ===========================
let hasSeeded = false;

function seedDefaultPhotos() {
  if (hasSeeded) return;
  hasSeeded = true;
  DEFAULT_PHOTOS.forEach(photo => {
    db.collection('images').add({
      date: photo.date,
      location: photo.location,
      imageUrl: photo.imageUrl,
      blogUrl: photo.blogUrl,
      isDefault: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e => console.error('시딩 실패:', e));
  });
}

// ===========================
// Firebase: Load Photos
// ===========================
async function loadPhotosFromFirestore() {
  try {
    // orderBy 제거: createdAt이 아직 서버에 기록되지 않은 문서도 안전하게 가져오기
    const snapshot = await db.collection('images').get();

    if (snapshot.empty) {
      seedDefaultPhotos();
      setTimeout(() => loadPhotosFromFirestore(), 2000);
      return;
    }

    photos = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date().toISOString()
      };
    });

    // 불완전한 문서 필터링 (location 또는 imageUrl이 없는 문서 제외)
    photos = photos.filter(p => p.location && p.imageUrl);

    // 클라이언트 사이드 정렬 적용
    applySort();

    updateTags(activeFilter);
    renderCards(activeFilter);
  } catch (error) {
    console.error('Firestore 로드 실패:', error);
  }
}

// ===========================
// Image Optimization (client-side)
// ===========================
const UPLOAD_WIDTH = 1080;
const UPLOAD_HEIGHT = 1920; // 9:16 ratio

function resizeImageForUpload(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = UPLOAD_WIDTH;
      canvas.height = UPLOAD_HEIGHT;
      const ctx = canvas.getContext('2d');

      // Center-crop to 9:16 ratio, then draw at 1080x1920
      const targetRatio = UPLOAD_WIDTH / UPLOAD_HEIGHT; // 0.5625
      const srcRatio = img.width / img.height;

      let sx, sy, sw, sh;
      if (srcRatio > targetRatio) {
        // Source is wider → crop sides
        sh = img.height;
        sw = img.height * targetRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
      } else {
        // Source is taller → crop top/bottom
        sw = img.width;
        sh = img.width / targetRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, UPLOAD_WIDTH, UPLOAD_HEIGHT);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('이미지 변환 실패'));
        }
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = URL.createObjectURL(file);
  });
}

// ===========================
// Cloudinary: Upload Image (Unsigned)
// ===========================
async function uploadImageToCloudinary(file) {
  // 1. Resize to 1080x1920 (9:16)
  const optimizedBlob = await resizeImageForUpload(file);

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  // 2. Upload optimized image
  const formData = new FormData();
  formData.append('file', optimizedBlob, 'photo.jpg');
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  console.log('📤 Cloudinary 업로드 시작...');

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('❌ Cloudinary 에러:', errText);
    throw new Error(`Cloudinary 업로드 실패: ${response.status}`);
  }

  const data = await response.json();
  console.log('✅ Cloudinary 업로드 완료:', data.secure_url);
  return data.secure_url;
}

// ===========================
// Firebase: Add Photo
// ===========================
async function addPhotoToFirestore(photoData) {
  return await db.collection('images').add({
    ...photoData,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

// ===========================
// Firebase: Delete Photo
// ===========================
async function deletePhotoFromFirebase(photoId) {
  try {
    await db.collection('images').doc(photoId).delete();
  } catch (e) {
    console.error('삭제 실패:', e);
    alert('삭제에 실패했습니다. 다시 시도해 주세요.');
  }
}

// ===========================
// Dynamic Tags
// ===========================
// Helper: extract base location (before ' · ')
function getBaseLocation(loc) {
  return (loc || '').split(' · ')[0];
}

function updateTags(filter = 'all') {
  const locations = [...new Set(photos.map(p => getBaseLocation(p.location)).filter(Boolean))];

  tagsContainer.innerHTML = `
    <button class="tag ${filter === 'all' ? 'tag--active' : ''}" data-filter="all">전체</button>
    ${locations.map(loc => `
      <button class="tag ${filter === loc ? 'tag--active' : ''}" data-filter="${loc}">${loc}</button>
    `).join('')}
  `;
}

// ===========================
// Render Cards
// ===========================
// Scroll Reveal Animation (Intersection Observer)
// ===========================
const revealObserver = new IntersectionObserver((entries) => {
  let delayIndex = 0;
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const card = entry.target;
      // Apply stagger delay only if the card is not already visible
      if (!card.classList.contains('visible')) {
        card.style.setProperty('--stagger', `${delayIndex * 0.1}s`);
        delayIndex++;
        card.classList.add('visible');
        revealObserver.unobserve(card); // Stop observing once visible
      }
    }
  });
}, {
  threshold: 0.2 // Trigger when 20% of the card is visible
});

function renderCards(filter = 'all') {
  activeFilter = filter;
  const filtered = filter === 'all'
    ? photos
    : photos.filter(p => getBaseLocation(p.location) === filter);

  gallery.innerHTML = '';

  if (filtered.length === 0) {
    gallery.innerHTML = `
      <div class="gallery__empty">
        <p class="gallery__empty-icon">📷</p>
        <p class="gallery__empty-text">해당 지역의 사진이 아직 없어요.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(photo => {
    const card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', '카드 뒤집기');

    const displayDate = formatDate(photo.date);
    const jpDate = formatDateJP(photo.date);

    const blogBtnHtml = photo.blogUrl
      ? `<a class="card__back-blog" href="${photo.blogUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">📖 블로그 일기 보기</a>`
      : '';

    card.innerHTML = `
      <div class="card__inner">
        <div class="card__front">
          <div class="card__img-wrapper">
            <img class="card__img" src="${photo.imageUrl}" alt="${displayDate} ${photo.location}" loading="lazy">
            <div class="card__overlay">
              <span class="card__overlay-location">📍 ${photo.location}</span>
            </div>
            <span class="card__flip-hint">↻ 뒤집기</span>
          </div>
        </div>
        <div class="card__back">
          <div class="card__back-content">
            <div class="card__back-stamp">
              <span class="card__back-stamp-text">${getBaseLocation(photo.location)}</span>
            </div>
            <p class="card__back-date">${jpDate}</p>
            <p class="card__back-location">📍 ${photo.location}</p>
            <div class="card__back-divider"></div>
            ${blogBtnHtml}
          </div>
          <div class="card__back-actions">
            <button class="card__back-edit" data-id="${photo.id}" aria-label="수정" title="수정">✎</button>
            <button class="card__back-delete" data-id="${photo.id}" aria-label="삭제" title="삭제">✕</button>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card__back-delete')) return;
      if (e.target.closest('.card__back-edit')) return;
      if (e.target.closest('.card__back-blog')) return;
      card.classList.toggle('card--flipped');
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.classList.toggle('card--flipped');
      }
    });

    gallery.appendChild(card);
    revealObserver.observe(card); // Start observing the card
  });

  // Edit button handlers
  gallery.querySelectorAll('.card__back-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = btn.dataset.id;
      openEditModal(id);
    });
  });

  // Delete button handlers
  gallery.querySelectorAll('.card__back-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = btn.dataset.id;
      showDeleteConfirm(id);
    });
  });
}

// ===========================
// Sorting Logic
// ===========================
function applySort() {
  if (currentSort === 'newest') {
    // Newest date first
    photos.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } else {
    // Oldest date first
    photos.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
}

const sortToggle = document.getElementById('sort-toggle');
if (sortToggle) {
  sortToggle.addEventListener('click', () => {
    // Toggle sort order
    currentSort = currentSort === 'oldest' ? 'newest' : 'oldest';

    // Update UI state
    if (currentSort === 'newest') {
      sortToggle.classList.add('sort-toggle--newest');
      sortToggle.title = '최신순';
    } else {
      sortToggle.classList.remove('sort-toggle--newest');
      sortToggle.title = '오래된순';
    }

    // Re-apply sort and render
    applySort();
    renderCards(activeFilter);
  });
}

// ===========================
// Tag Filters
// ===========================
tagsContainer.addEventListener('click', (e) => {
  if (!e.target.classList.contains('tag')) return;

  tagsContainer.querySelectorAll('.tag').forEach(t => t.classList.remove('tag--active'));
  e.target.classList.add('tag--active');

  const filter = e.target.dataset.filter;
  renderCards(filter);
});

// ===========================
// Upload Modal
// ===========================
function openModal() {
  uploadModal.classList.add('modal-overlay--active');
  document.body.style.overflow = 'hidden';
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('input-date').value = today;
}

function closeModal() {
  uploadModal.classList.remove('modal-overlay--active');
  document.body.style.overflow = '';
  resetForm();
}

function resetForm() {
  uploadForm.reset();
  selectedFiles = [];
  filePreview.innerHTML = '';
  filePreview.hidden = true;
  const submitBtn = uploadForm.querySelector('.upload-form__submit');
  submitBtn.disabled = false;
  submitBtn.textContent = '추가하기';
}

addBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
uploadModal.addEventListener('click', (e) => {
  if (e.target === uploadModal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && uploadModal.classList.contains('modal-overlay--active')) {
    closeModal();
  }
});

// ===========================
// Dropzone / File Input
// ===========================
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('upload-form__dropzone--dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('upload-form__dropzone--dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('upload-form__dropzone--dragover');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
});

function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) return;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedFiles.push({
        file: file,
        dataUrl: e.target.result,
        name: file.name
      });
      renderPreview();
    };
    reader.readAsDataURL(file);
  });
}

function renderPreview() {
  filePreview.hidden = selectedFiles.length === 0;
  filePreview.innerHTML = selectedFiles.map((f, idx) => `
    <div class="upload-form__preview-item">
      <img src="${f.dataUrl}" alt="${f.name}">
      <button type="button" class="upload-form__preview-remove" data-idx="${idx}" aria-label="제거">&times;</button>
    </div>
  `).join('');

  filePreview.querySelectorAll('.upload-form__preview-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      selectedFiles.splice(idx, 1);
      renderPreview();
    });
  });
}

// ===========================
// Form Submission (Firebase Upload)
// ===========================
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (selectedFiles.length === 0) {
    alert('사진을 한 장 이상 선택해 주세요.');
    return;
  }

  const submitBtn = uploadForm.querySelector('.upload-form__submit');
  submitBtn.disabled = true;
  submitBtn.textContent = '업로드 중...';

  const date = document.getElementById('input-date').value;
  const locationBase = document.getElementById('input-location').value;
  const locationDetail = document.getElementById('input-location-detail').value.trim();
  const location = locationDetail ? `${locationBase} · ${locationDetail}` : locationBase;
  const blogUrl = document.getElementById('input-blog').value.trim();

  try {
    for (const fileObj of selectedFiles) {
      const imageUrl = await uploadImageToCloudinary(fileObj.file);

      await addPhotoToFirestore({
        date,
        location,
        imageUrl,
        blogUrl,
        isDefault: false
      });
    }

    closeModal();
    await loadPhotosFromFirestore();
  } catch (err) {
    console.error('업로드 실패:', err);
    alert('업로드에 실패했습니다. 다시 시도해 주세요.');
    submitBtn.disabled = false;
    submitBtn.textContent = '추가하기';
  }
});

// ===========================
// Edit Modal
// ===========================
const editModal = document.getElementById('edit-modal');
const editModalClose = document.getElementById('edit-modal-close');
const editForm = document.getElementById('edit-form');
const editImageZone = document.getElementById('edit-image-zone');
const editImagePreview = document.getElementById('edit-image-preview');
const editFileInput = document.getElementById('edit-file-input');
let editingPhotoId = null;
let editNewFile = null; // new image file selected by user

function openEditModal(photoId) {
  const photo = photos.find(p => p.id === photoId);
  if (!photo) return;

  editingPhotoId = photoId;
  editNewFile = null;

  // Show current image
  editImagePreview.src = photo.imageUrl || '';
  editImageZone.classList.remove('edit-image-zone--changed');

  document.getElementById('edit-date').value = photo.date || '';

  // Parse "히로시마 · 평화기념공원" → select: 히로시마, detail: 평화기념공원
  const locParts = (photo.location || '').split(' · ');
  document.getElementById('edit-location').value = locParts[0] || '';
  document.getElementById('edit-location-detail').value = locParts[1] || '';

  document.getElementById('edit-blog').value = photo.blogUrl || '';

  editModal.classList.add('modal-overlay--active');
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
  editModal.classList.remove('modal-overlay--active');
  document.body.style.overflow = '';
  editingPhotoId = null;
  editNewFile = null;
}

// Click image zone → open file picker
editImageZone.addEventListener('click', () => editFileInput.click());

// When a new file is selected
editFileInput.addEventListener('change', () => {
  const file = editFileInput.files[0];
  if (!file || !file.type.startsWith('image/')) return;

  editNewFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    editImagePreview.src = e.target.result;
    editImageZone.classList.add('edit-image-zone--changed');
  };
  reader.readAsDataURL(file);
});

editModalClose.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal();
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingPhotoId) return;

  const submitBtn = editForm.querySelector('.upload-form__submit');
  submitBtn.disabled = true;
  submitBtn.textContent = '저장 중...';

  try {
    const locBase = document.getElementById('edit-location').value;
    const locDetail = document.getElementById('edit-location-detail').value.trim();
    const location = locDetail ? `${locBase} · ${locDetail}` : locBase;

    const updateData = {
      date: document.getElementById('edit-date').value,
      location,
      blogUrl: document.getElementById('edit-blog').value.trim()
    };

    // If user selected a new image, upload and update imageUrl
    if (editNewFile) {
      submitBtn.textContent = '사진 업로드 중...';
      const newImageUrl = await uploadImageToCloudinary(editNewFile);
      updateData.imageUrl = newImageUrl;
    }

    await db.collection('images').doc(editingPhotoId).update(updateData);

    closeEditModal();
    await loadPhotosFromFirestore();
  } catch (err) {
    console.error('수정 실패:', err);
    alert('수정에 실패했습니다. 다시 시도해 주세요.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '수정 완료';
  }
});

// ===========================
// Custom Delete Confirm Modal
// ===========================
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const deleteCancelBtn = document.getElementById('delete-cancel');
const deleteOkBtn = document.getElementById('delete-ok');
let pendingDeleteId = null;

function showDeleteConfirm(id) {
  pendingDeleteId = id;
  suppressOutsideClick = true;
  deleteConfirmModal.classList.add('delete-confirm-overlay--active');
}

function hideDeleteConfirm() {
  deleteConfirmModal.classList.remove('delete-confirm-overlay--active');
  pendingDeleteId = null;
  setTimeout(() => { suppressOutsideClick = false; }, 100);
}

deleteCancelBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  hideDeleteConfirm();
});

deleteOkBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (pendingDeleteId) {
    deleteOkBtn.textContent = '삭제 중...';
    deleteOkBtn.disabled = true;

    await deletePhotoFromFirebase(pendingDeleteId);
    await loadPhotosFromFirestore();

    deleteOkBtn.textContent = '삭제';
    deleteOkBtn.disabled = false;
  }
  hideDeleteConfirm();
});

deleteConfirmModal.addEventListener('click', (e) => {
  if (e.target === deleteConfirmModal) {
    e.stopPropagation();
    hideDeleteConfirm();
  }
});

// ===========================
// Click outside card to unflip
// ===========================
document.addEventListener('click', (e) => {
  if (suppressOutsideClick) return;
  if (!e.target.closest('.card')) {
    document.querySelectorAll('.card--flipped').forEach(card => {
      card.classList.remove('card--flipped');
    });
  }
});

// ===========================
// View Mode Toggle
// ===========================
function setViewMode(mode) {
  if (mode === 'grid') {
    gallery.classList.add('gallery--grid');
    viewGridBtn.classList.add('view-toggle__btn--active');
    viewListBtn.classList.remove('view-toggle__btn--active');
  } else {
    gallery.classList.remove('gallery--grid');
    viewListBtn.classList.add('view-toggle__btn--active');
    viewGridBtn.classList.remove('view-toggle__btn--active');
  }
  localStorage.setItem(VIEW_MODE_KEY, mode);
}

viewListBtn.addEventListener('click', () => setViewMode('list'));
viewGridBtn.addEventListener('click', () => setViewMode('grid'));

// ===========================
// Init
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Show loading state (do NOT render default photos to avoid flash)
  gallery.innerHTML = `
    <div class="gallery__empty">
      <p class="gallery__empty-icon">⏳</p>
      <p class="gallery__empty-text">사진을 불러오는 중...</p>
    </div>
  `;

  // 2. Restore view mode
  const savedMode = localStorage.getItem(VIEW_MODE_KEY) || 'list';
  setViewMode(savedMode);

  // 3. Load Firestore data
  loadPhotosFromFirestore();
});
