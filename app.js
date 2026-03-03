// ===========================
// Default Sample Data
// ===========================
const DEFAULT_PHOTOS = [
  {
    id: 'default-1',
    date: '2026-02-05',
    location: '도쿄',
    locationDetail: '신주쿠 골든가이',
    image: 'images/tokyo-alley.png',
    blogUrl: '',
    isDefault: true
  },
  {
    id: 'default-2',
    date: '2026-02-12',
    location: '교토',
    locationDetail: '히가시야마 킷사텐',
    image: 'images/japan-cafe.png',
    blogUrl: '',
    isDefault: true
  },
  {
    id: 'default-3',
    date: '2026-02-20',
    location: '후지산',
    locationDetail: '가와구치코 호수',
    image: 'images/fuji-lake.png',
    blogUrl: '',
    isDefault: true
  }
];

// ===========================
// State
// ===========================
let photos = [];
let activeFilter = 'all';
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
    db.collection('photos').add({
      date: photo.date,
      location: photo.location,
      locationDetail: photo.locationDetail,
      image: photo.image,
      blogUrl: photo.blogUrl,
      isDefault: true,
      createdAt: new Date().toISOString()
    }).catch(e => console.error('시딩 실패:', e));
  });
}

// ===========================
// Firebase: Load Photos
// ===========================
async function loadPhotosFromFirestore() {
  try {
    const snapshot = await db.collection('photos').get();

    if (snapshot.empty) {
      seedDefaultPhotos();
      setTimeout(() => loadPhotosFromFirestore(), 3000);
      return;
    }

    photos = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort by createdAt descending
    photos.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    updateTags(activeFilter);
    renderCards(activeFilter);
  } catch (error) {
    console.error('❌ Firestore 로딩 에러:', error);
    // Fallback to defaults
    photos = [...DEFAULT_PHOTOS];
    updateTags(activeFilter);
    renderCards(activeFilter);
  }
}

// ===========================
// Firebase: Upload Image to Storage
// ===========================
async function uploadImageToStorage(file) {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `photos/${timestamp}_${safeName}`;
  const storageRef = storage.ref(filePath);

  await storageRef.put(file);
  const downloadURL = await storageRef.getDownloadURL();
  return { downloadURL, filePath };
}

// ===========================
// Firebase: Add Photo
// ===========================
async function addPhotoToFirestore(photoData) {
  return await db.collection('photos').add({
    ...photoData,
    createdAt: new Date().toISOString()
  });
}

// ===========================
// Firebase: Delete Photo
// ===========================
async function deletePhotoFromFirebase(photoId, storagePath) {
  try {
    // Delete Firestore document
    await db.collection('photos').doc(photoId).delete();

    // Delete from Storage (only for uploaded images, not defaults)
    if (storagePath && !storagePath.startsWith('images/')) {
      try {
        await storage.ref(storagePath).delete();
      } catch (storageErr) {
        console.warn('Storage 파일 삭제 실패:', storageErr);
      }
    }
  } catch (e) {
    console.error('삭제 실패:', e);
    alert('삭제에 실패했습니다. 다시 시도해 주세요.');
  }
}

// ===========================
// Dynamic Tags
// ===========================
function updateTags(filter = 'all') {
  const locations = [...new Set(photos.map(p => p.location))];

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
function renderCards(filter = 'all') {
  activeFilter = filter;
  const filtered = filter === 'all'
    ? photos
    : photos.filter(p => p.location === filter);

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
    const locationFull = photo.locationDetail
      ? `${photo.location} · ${photo.locationDetail}`
      : photo.location;

    const blogBtnHtml = photo.blogUrl
      ? `<a class="card__back-blog" href="${photo.blogUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">📖 블로그 일기 보기</a>`
      : '';

    card.innerHTML = `
      <div class="card__inner">
        <div class="card__front">
          <div class="card__img-wrapper">
            <img class="card__img" src="${photo.image}" alt="${displayDate} ${photo.location}" loading="lazy">
            <div class="card__overlay">
              <span class="card__overlay-location">📍 ${locationFull}</span>
            </div>
            <span class="card__flip-hint">↻ 뒤집기</span>
          </div>
        </div>
        <div class="card__back">
          <div class="card__back-content">
            <div class="card__back-stamp">
              <span class="card__back-stamp-text">${photo.location}</span>
            </div>
            <p class="card__back-date">${jpDate}</p>
            <p class="card__back-location">📍 ${locationFull}</p>
            <div class="card__back-divider"></div>
            ${blogBtnHtml}
            <button class="card__back-delete" data-id="${photo.id}" data-path="${photo.storagePath || ''}" aria-label="삭제" title="삭제">🗑</button>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card__back-delete')) return;
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
  });

  // Delete button handlers
  gallery.querySelectorAll('.card__back-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = btn.dataset.id;
      const path = btn.dataset.path;
      showDeleteConfirm(id, path);
    });
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
  const location = document.getElementById('input-location').value;
  const locationDetail = document.getElementById('input-location-detail').value.trim();
  const blogUrl = document.getElementById('input-blog').value.trim();

  try {
    for (const fileObj of selectedFiles) {
      const { downloadURL, filePath } = await uploadImageToStorage(fileObj.file);

      await addPhotoToFirestore({
        date,
        location,
        locationDetail,
        image: downloadURL,
        storagePath: filePath,
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
// Custom Delete Confirm Modal
// ===========================
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const deleteCancelBtn = document.getElementById('delete-cancel');
const deleteOkBtn = document.getElementById('delete-ok');
let pendingDeleteId = null;
let pendingDeletePath = null;

function showDeleteConfirm(id, storagePath) {
  pendingDeleteId = id;
  pendingDeletePath = storagePath || null;
  suppressOutsideClick = true;
  deleteConfirmModal.classList.add('delete-confirm-overlay--active');
}

function hideDeleteConfirm() {
  deleteConfirmModal.classList.remove('delete-confirm-overlay--active');
  pendingDeleteId = null;
  pendingDeletePath = null;
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

    await deletePhotoFromFirebase(pendingDeleteId, pendingDeletePath);
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
  // Show loading state
  gallery.innerHTML = `
    <div class="gallery__empty">
      <p class="gallery__empty-icon">⏳</p>
      <p class="gallery__empty-text">사진을 불러오는 중...</p>
    </div>
  `;

  // Load data from Firestore
  loadPhotosFromFirestore();

  // Restore view mode
  const savedMode = localStorage.getItem(VIEW_MODE_KEY) || 'list';
  setViewMode(savedMode);
});
