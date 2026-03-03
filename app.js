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

const STORAGE_KEY = 'handalsal-archive-photos';

// ===========================
// Data Management
// ===========================
function loadPhotos() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.warn('LocalStorage 데이터 파싱 실패, 기본 데이터 사용');
    }
  }
  // First time: save defaults
  savePhotos(DEFAULT_PHOTOS);
  return [...DEFAULT_PHOTOS];
}

function savePhotos(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let photos = loadPhotos();

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
const viewToggle = document.getElementById('view-toggle');
const viewListBtn = document.getElementById('view-list');
const viewGridBtn = document.getElementById('view-grid');

const VIEW_MODE_KEY = 'handalsal-view-mode';
let selectedFiles = []; // { file, dataUrl }

// ===========================
// Date Formatting
// ===========================
function formatDate(dateStr) {
  // Convert YYYY-MM-DD to YYYY.MM.DD
  return dateStr.replace(/-/g, '.');
}

function formatDateJP(dateStr) {
  const d = new Date(dateStr);
  const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
  return `${d.getFullYear()}年 ${months[d.getMonth()]} ${d.getDate()}日`;
}

// ===========================
// Dynamic Tags
// ===========================
function updateTags(activeFilter = 'all') {
  const locations = [...new Set(photos.map(p => p.location))];

  tagsContainer.innerHTML = `
    <button class="tag ${activeFilter === 'all' ? 'tag--active' : ''}" data-filter="all">전체</button>
    ${locations.map(loc => `
      <button class="tag ${activeFilter === loc ? 'tag--active' : ''}" data-filter="${loc}">${loc}</button>
    `).join('')}
  `;
}

// ===========================
// Render Cards
// ===========================
let activeFilter = 'all';
let suppressOutsideClick = false;

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

    // Conditional blog button
    const blogBtnHtml = photo.blogUrl
      ? `<a class="card__back-blog" href="${photo.blogUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">📖 블로그 일기 보기</a>`
      : '';

    card.innerHTML = `
      <div class="card__inner">
        <!-- Front (Photo Only) -->
        <div class="card__front">
          <div class="card__img-wrapper">
            <img class="card__img" src="${photo.image}" alt="${displayDate} ${photo.location}" loading="lazy">
            <div class="card__overlay">
              <span class="card__overlay-location">📍 ${locationFull}</span>
            </div>
            <span class="card__flip-hint">↻ 뒤집기</span>
          </div>
        </div>

        <!-- Back (Japanese Diary) -->
        <div class="card__back">
          <div class="card__back-content">
            <div class="card__back-stamp">
              <span class="card__back-stamp-text">${photo.location}</span>
            </div>
            <p class="card__back-date">${jpDate}</p>
            <p class="card__back-location">📍 ${locationFull}</p>
            <div class="card__back-divider"></div>
            ${blogBtnHtml}
            <button class="card__back-delete" data-id="${photo.id}" aria-label="삭제" title="삭제">🗑</button>
          </div>
        </div>
      </div>
    `;

    // Flip on click
    card.addEventListener('click', (e) => {
      // Don't flip if clicking delete or blog button
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
      showDeleteConfirm(id);
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
  // Set default date to today
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

  // Read each file as base64
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

  // Remove handlers
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
// Form Submission (Batch Upload)
// ===========================
uploadForm.addEventListener('submit', (e) => {
  e.preventDefault();

  if (selectedFiles.length === 0) {
    alert('사진을 한 장 이상 선택해 주세요.');
    return;
  }

  const date = document.getElementById('input-date').value;
  const location = document.getElementById('input-location').value;
  const locationDetail = document.getElementById('input-location-detail').value.trim();
  const blogUrl = document.getElementById('input-blog').value.trim();

  // Create cards for each file (batch)
  const newPhotos = selectedFiles.map((f, idx) => ({
    id: `user-${Date.now()}-${idx}`,
    date: date,
    location: location,
    locationDetail: locationDetail,
    image: f.dataUrl, // base64
    blogUrl: blogUrl,
    isDefault: false
  }));

  photos = [...newPhotos, ...photos]; // New photos go to front
  savePhotos(photos);

  closeModal();
  updateTags(activeFilter);
  renderCards(activeFilter);
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
  // Delay re-enabling outside click so the click from closing doesn't unflip
  setTimeout(() => { suppressOutsideClick = false; }, 100);
}

deleteCancelBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  hideDeleteConfirm();
});

deleteOkBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (pendingDeleteId) {
    photos = photos.filter(p => p.id !== pendingDeleteId);
    savePhotos(photos);
    updateTags(activeFilter);
    // If current filter has no photos, reset to 'all'
    const remaining = activeFilter === 'all'
      ? photos
      : photos.filter(p => p.location === activeFilter);
    if (remaining.length === 0 && activeFilter !== 'all') {
      activeFilter = 'all';
      updateTags('all');
    }
    renderCards(activeFilter);
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
  updateTags();
  renderCards();

  // Restore saved view mode (default: list)
  const savedMode = localStorage.getItem(VIEW_MODE_KEY) || 'list';
  setViewMode(savedMode);
});
