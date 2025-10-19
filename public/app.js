// app.js - Client-side JavaScript with multi-source support
(function(){
  function escapeHtml(s){ 
    return (s==null)?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); 
  }
  
  let _rows=[],_headings=[],_objectName='',_sourceId='',_filtered=[],_pageSize=10,_currentPage=1;
  
  function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar-wrapper');
    const overlay = document.querySelector('.sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  }
  
  window.toggleMobileMenu = toggleMobileMenu;
  
  function fetchWithAuth(url, options = {}) {
    const sessionId = localStorage.getItem('sessionId');
    options.headers = options.headers || {};
    if (!(options.body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json';
    }
    options.headers['x-session-id'] = sessionId;
    return fetch(url, options);
  }

  async function refreshSitemap() {
    const refreshBtn = document.querySelector('.refresh-sitemap-btn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⟳';
      refreshBtn.classList.add('spinning');
    }

    try {
      const response = await fetchWithAuth('/api/sitemap-html');
      const data = await response.json();
      
      if (data.success && data.html) {
        const sidebar = document.querySelector('.sidebar-wrapper');
        if (sidebar) {
          sidebar.innerHTML = data.html;
          console.log('Sitemap refreshed successfully');
        }
      } else {
        throw new Error(data.error || 'Failed to refresh sitemap');
      }
    } catch (error) {
      console.error('Error refreshing sitemap:', error);
      alert('Failed to refresh sitemap: ' + error.message);
    } finally {
      const refreshBtn = document.querySelector('.refresh-sitemap-btn');
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '↻';
        refreshBtn.classList.remove('spinning');
      }
    }
  }

  window.refreshSitemap = refreshSitemap;

  function openImportModal(object, sourceId) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = 'Import CSV - ' + object;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => document.body.removeChild(overlay);
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const instructions = document.createElement('div');
    instructions.className = 'import-instructions';
    instructions.innerHTML = `
      <h4>CSV Import Instructions</h4>
      <ul>
        <li>CSV file must have column headers matching table columns</li>
        <li>Maximum file size: 10MB</li>
        <li>Rows will be validated before import</li>
        <li>Invalid rows will be skipped with error messages</li>
      </ul>
    `;
    body.appendChild(instructions);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.className = 'form-control';
    fileInput.style.marginTop = '20px';
    body.appendChild(fileInput);

    const preview = document.createElement('div');
    preview.className = 'csv-preview';
    preview.style.marginTop = '20px';
    body.appendChild(preview);

    const statusDiv = document.createElement('div');
    statusDiv.className = 'import-status';
    statusDiv.style.marginTop = '20px';
    body.appendChild(statusDiv);

    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          preview.innerHTML = '<div class="error">CSV file is empty</div>';
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const previewRows = lines.slice(1, 6);

        let html = '<h4>Preview (first 5 rows)</h4>';
        html += '<table class="table"><thead><tr>';
        headers.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
        html += '</tr></thead><tbody>';
        
        previewRows.forEach(row => {
          const cells = row.split(',').map(c => c.trim());
          html += '<tr>';
          cells.forEach(c => html += `<td>${escapeHtml(c)}</td>`);
          html += '</tr>';
        });
        
        html += '</tbody></table>';
        html += `<p><strong>Total rows to import:</strong> ${lines.length - 1}</p>`;
        preview.innerHTML = html;
      };
      reader.readAsText(file);
    };

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-success';
    importBtn.textContent = 'Import CSV';
    importBtn.onclick = async () => {
      const file = fileInput.files[0];
      if (!file) {
        alert('Please select a CSV file');
        return;
      }

      importBtn.disabled = true;
      importBtn.textContent = 'Importing...';
      statusDiv.innerHTML = '<div class="info">Importing data...</div>';

      const formData = new FormData();
      formData.append('csvFile', file);
      formData.append('object', object);
      formData.append('source', sourceId);

      try {
        const res = await fetchWithAuth('/import-csv', {
          method: 'POST',
          body: formData
        });

        const result = await res.json();

        if (!res.ok) {
          throw new Error(result.error || 'Import failed');
        }

        let statusHtml = `<div class="success">
          <strong>Import completed!</strong><br>
          Successfully imported: ${result.imported} / ${result.total} rows
        </div>`;

        if (result.errors && result.errors.length > 0) {
          statusHtml += '<div class="warning"><strong>Errors:</strong><ul>';
          result.errors.forEach(err => {
            statusHtml += `<li>Row ${err.row}: ${escapeHtml(err.error)}</li>`;
          });
          statusHtml += '</ul></div>';
        }

        statusDiv.innerHTML = statusHtml;
        importBtn.textContent = 'Import Complete';

        setTimeout(() => {
          const main = document.querySelector('.content-area');
          main.innerHTML = '<div>Loading...</div>';
          fetchWithAuth('/objectdata?object=' + encodeURIComponent(object) + '&source=' + encodeURIComponent(sourceId))
            .then(r => r.json())
            .then(d => renderTableUI(main, d, sourceId));
          document.body.removeChild(overlay);
        }, 2000);

      } catch (err) {
        statusDiv.innerHTML = `<div class="error">Import failed: ${escapeHtml(err.message)}</div>`;
        importBtn.disabled = false;
        importBtn.textContent = 'Import CSV';
      }
    };
    actions.appendChild(importBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => document.body.removeChild(overlay);
    actions.appendChild(cancelBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  window.openImportModal = openImportModal;

  function renderTableUI(container, data, sourceId){
    _objectName = data.object || '';
    _sourceId = sourceId;
    _headings = Array.isArray(data.headings) ? data.headings : [];
    _rows = Array.isArray(data.rows) ? data.rows : [];
    _filtered = _rows.slice();
    _currentPage = 1;

    container.innerHTML = '';
    
    const title = document.createElement('div');
    title.className = 'table-title';
    title.textContent = data.title || data.object || '';

    const subtitle = document.createElement('div');
    subtitle.className = 'table-subtitle';
    subtitle.textContent = (_rows.length === 1) ? '1 record' : (_rows.length + ' records');

    const toolbar = document.createElement('div');
    toolbar.className = 'table-toolbar';
    
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-success btn-sm';
    addBtn.textContent = 'Add';
    addBtn.onclick = () => openAddModal(_objectName, _sourceId);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-info btn-sm';
    importBtn.textContent = 'Import CSV';
    importBtn.style.marginLeft = '8px';
    importBtn.onclick = () => openImportModal(_objectName, _sourceId);

    const search = document.createElement('input');
    search.className = 'table-search';
    search.placeholder = 'Search...';
    search.type = 'search';
    search.oninput = () => {
      const q = search.value.toLowerCase();
      _filtered = q ? _rows.filter(r => r.some(c => String(c).toLowerCase().includes(q))) : _rows.slice();
      _currentPage = 1;
      renderBodyAndPager();
    };

    toolbar.appendChild(addBtn);
    toolbar.appendChild(importBtn);
    toolbar.appendChild(search);
    container.appendChild(title);
    container.appendChild(subtitle);
    container.appendChild(toolbar);

    const tableWrap = document.createElement('div');
    const pagerWrap = document.createElement('div');
    container.appendChild(tableWrap);
    container.appendChild(pagerWrap);

    function renderBodyAndPager(){
      const table = document.createElement('table');
      table.className = 'table';
      table.id = 'objectTable';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      _headings.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h.name || h;
        headRow.appendChild(th);
      });
      const actionTh = document.createElement('th');
      actionTh.textContent = 'Action';
      headRow.appendChild(actionTh);
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      const total = _filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / _pageSize));
      if (_currentPage > totalPages) _currentPage = totalPages;
      const start = (_currentPage - 1) * _pageSize;
      const pageRows = _filtered.slice(start, start + _pageSize);

      pageRows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        });

        const tdAction = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-primary btn-sm me-1';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => openEditModal(_objectName, _sourceId, row[0]);
        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-danger btn-sm';
        delBtn.textContent = 'Delete';
        delBtn.onclick = () => openDeleteModal(_objectName, _sourceId, row[0]);
        tdAction.appendChild(editBtn);
        tdAction.appendChild(delBtn);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
      });

      if (pageRows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = _headings.length + 1;
        td.textContent = 'No rows';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      tableWrap.innerHTML = '';
      tableWrap.appendChild(table);

      const pager = document.createElement('div');
      pager.className = 'paginator';
      const prevBtn = document.createElement('button');
      prevBtn.className = 'page-btn';
      prevBtn.textContent = 'Prev';
      prevBtn.disabled = _currentPage <= 1;
      prevBtn.onclick = () => { if (_currentPage > 1) { _currentPage--; renderBodyAndPager(); } };
      pager.appendChild(prevBtn);

      for (let p = Math.max(1, _currentPage - 2); p <= Math.min(totalPages, _currentPage + 2); p++) {
        const pBtn = document.createElement('button');
        pBtn.className = 'page-btn' + (p === _currentPage ? ' active' : '');
        pBtn.textContent = String(p);
        pBtn.onclick = () => { _currentPage = p; renderBodyAndPager(); };
        pager.appendChild(pBtn);
      }

      const nextBtn = document.createElement('button');
      nextBtn.className = 'page-btn';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = _currentPage >= totalPages;
      nextBtn.onclick = () => { if (_currentPage < totalPages) { _currentPage++; renderBodyAndPager(); } };
      pager.appendChild(nextBtn);

      pagerWrap.innerHTML = '';
      pagerWrap.appendChild(pager);
    }
    renderBodyAndPager();
  }

  function openEditModal(object, sourceId, id) {
    fetchWithAuth('/objectdata?object=' + encodeURIComponent(object) + '&source=' + encodeURIComponent(sourceId) + '&id=' + encodeURIComponent(id))
      .then(r => r.json())
      .then(data => {
        if (!data.row) { alert('Row not found'); return; }
        showModal({ mode: 'edit', object, sourceId, headings: data.headings, row: data.row, idValue: id });
      })
      .catch(e => { console.error(e); alert('Failed to load'); });
  }

  function openDeleteModal(object, sourceId, id) {
    fetchWithAuth('/objectdata?object=' + encodeURIComponent(object) + '&source=' + encodeURIComponent(sourceId) + '&id=' + encodeURIComponent(id))
      .then(r => r.json())
      .then(data => {
        if (!data.row) { alert('Row not found'); return; }
        showModal({ mode: 'delete', object, sourceId, headings: data.headings, row: data.row, idValue: id });
      })
      .catch(e => { console.error(e); alert('Failed to load'); });
  }

  function openAddModal(object, sourceId) {
    fetchWithAuth('/objectdata?object=' + encodeURIComponent(object) + '&source=' + encodeURIComponent(sourceId))
      .then(r => r.json())
      .then(data => {
        const headings = data.headings || [];
        const emptyRow = headings.map(() => '');
        showModal({ mode: 'add', object, sourceId, headings, row: emptyRow, idValue: null });
      })
      .catch(e => { console.error(e); alert('Failed to load'); });
  }

  async function showModal(opts) {
    const { mode, object, sourceId, headings = [], row = [], idValue } = opts;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = (mode === 'edit' ? 'Edit ' : mode === 'add' ? 'Add ' : 'Delete ') + object;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => document.body.removeChild(overlay);
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const inputs = [];
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const fieldName = h.name || ('Col ' + i);
      const fieldType = h.type || 'text';
      const luFile = h.luFile || null;
      const readonly = h.readonly || false;
      const val = row[i] || '';

      const row_div = document.createElement('div');
      row_div.className = 'modal-row';

      const label = document.createElement('div');
      label.className = 'modal-label';
      label.textContent = fieldName;

      const input_wrap = document.createElement('div');
      input_wrap.className = 'modal-input';

      if (mode === 'edit' || mode === 'add') {
        if (readonly) {
          const val_div = document.createElement('div');
          val_div.textContent = val;
          input_wrap.appendChild(val_div);
          inputs.push({ value: val });
        } else if (fieldType === 'lu' && luFile) {
          const select = document.createElement('select');
          select.className = 'form-control';
          const emptyOpt = document.createElement('option');
          emptyOpt.value = '';
          emptyOpt.textContent = '-- Select --';
          select.appendChild(emptyOpt);

          try {
            const lookupData = await fetchWithAuth('/lookupdata?file=' + encodeURIComponent(luFile) + '&source=' + encodeURIComponent(sourceId)).then(r => r.json());
            if (lookupData.values) {
              lookupData.values.forEach(optVal => {
                const opt = document.createElement('option');
                opt.value = optVal;
                opt.textContent = optVal;
                if (optVal === val) opt.selected = true;
                select.appendChild(opt);
              });
            }
          } catch (err) {
            console.error('Failed to load lookup:', err);
          }

          input_wrap.appendChild(select);
          inputs.push(select);
        } else {
          const inp = document.createElement('input');
          inp.className = 'form-control';
          inp.value = val;
          
          if (fieldType === 'date') {
            inp.type = 'date';
          } else if (fieldType === 'integer') {
            inp.type = 'number';
            inp.step = '1';
            inp.pattern = '[0-9]*';
            inp.inputMode = 'numeric';
          } else if (fieldType === 'number') {
            inp.type = 'number';
            inp.step = 'any';
            inp.inputMode = 'decimal';
          } else if (fieldType === 'boolean') {
            inp.type = 'checkbox';
            inp.checked = val === 'true' || val === true || val === '1';
          } else {
            inp.type = 'text';
          }
          
          input_wrap.appendChild(inp);
          inputs.push(inp);
        }
      } else {
        const val_div = document.createElement('div');
        val_div.textContent = val;
        input_wrap.appendChild(val_div);
      }

      row_div.appendChild(label);
      row_div.appendChild(input_wrap);
      body.appendChild(row_div);
    }

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    if (mode === 'edit' || mode === 'add') {
      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn btn-success';
      submitBtn.textContent = mode === 'edit' ? 'Save' : 'Add';
      submitBtn.onclick = async () => {
        const newRow = {};
        headings.forEach((h, i) => {
          const input = inputs[i];
          if (h.type === 'boolean') {
            newRow[h.name] = input.checked ? 'true' : 'false';
          } else {
            newRow[h.name] = input.value;
          }
        });
        const endpoint = mode === 'edit' ? '/saveobject' : '/addobject';
        const payload = mode === 'edit' 
          ? { object, source: sourceId, id: idValue, row: newRow } 
          : { object, source: sourceId, row: newRow };
        try {
          const res = await fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify(payload) });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed');
          const main = document.querySelector('.content-area');
          main.innerHTML = '<div>Loading...</div>';
          fetchWithAuth('/objectdata?object=' + encodeURIComponent(object) + '&source=' + encodeURIComponent(sourceId))
            .then(r => r.json())
            .then(d => renderTableUI(main, d, sourceId));
          document.body.removeChild(overlay);
        } catch (err) { alert('Operation failed: ' + err.message); }
      };
      actions.appendChild(submitBtn);
    }

    if (mode === 'delete') {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger';
      delBtn.textContent = 'Confirm Delete';
      delBtn.onclick = async () => {
        try {
          const res = await fetchWithAuth('/deleteobject', { 
            method: 'POST', 
            body: JSON.stringify({ object, source: sourceId, id: idValue }) 
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed');
          const main = document.querySelector('.content-area');
          main.innerHTML = '<div>Loading...</div>';
          fetchWithAuth('/objectdata?object=' + encodeURIComponent(object) + '&source=' + encodeURIComponent(sourceId))
            .then(r => r.json())
            .then(d => renderTableUI(main, d, sourceId));
          document.body.removeChild(overlay);
        } catch (err) { alert('Delete failed: ' + err.message); }
      };
      actions.appendChild(delBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => document.body.removeChild(overlay);
    actions.appendChild(cancelBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('sidebar-overlay')) {
      toggleMobileMenu();
    }
    
    if (e.target.classList.contains('sitemap-toggle')) {
      const c = e.target.nextElementSibling;
      if (c) {
        const hidden = c.classList.toggle('d-none');
        e.target.textContent = hidden ? '▶' : '▼';
      }
    }
    
    const label = e.target.closest('.sitemap-label');
    if (label) {
      const obj = label.dataset.object;
      const sourceId = label.dataset.source;
      const url = label.dataset.url;
      
      if (obj) {
        if (obj === 'home') {
          const main = document.querySelector('.content-area');
          const logoutBtn = main.querySelector('.logout-btn');
          const dataSourceName = document.body.getAttribute('data-datasource') || 'Unknown';
          
          main.innerHTML = `
            <div class="home-page">
              <div class="home-header">
                <h1 class="home-title">Welcome to your dotConfig data driven application</h1>
                <p class="home-subtitle">This is a modern web application for managing your data with ease</p>
                <p class="home-datasource">Connected to multiple data sources</p>
              </div>
              
              <div class="home-content">
                <div class="home-section">
                  <h2 class="section-title">Getting Started</h2>
                  <ul class="feature-list">
                    <li>Select an item from the sidebar to view and manage data</li>
                    <li>Use the search box to filter records</li>
                    <li>Click "Add" to create new records</li>
                    <li>Click "Edit" to modify existing records</li>
                    <li>Click "Delete" to remove records</li>
                    <li>Click "Import CSV" to bulk import data</li>
                  </ul>
                </div>
                
                <div class="home-section">
                  <h2 class="section-title">Features</h2>
                  <ul class="feature-list">
                    <li><strong>Multi-Source Support:</strong> Access data from multiple sources</li>
                    <li><strong>CRUD Operations:</strong> Create, Read, Update, and Delete records</li>
                    <li><strong>CSV Import:</strong> Bulk import data from CSV files</li>
                    <li><strong>Search & Filter:</strong> Quickly find the data you need</li>
                    <li><strong>Pagination:</strong> Navigate through large datasets easily</li>
                    <li><strong>Responsive Design:</strong> Works on desktop, tablet, and mobile</li>
                  </ul>
                </div>
              </div>
            </div>
          `;
          if (logoutBtn) {
            main.insertBefore(logoutBtn, main.firstChild);
          }
        } else {
          if (!sourceId) {
            alert('Source ID missing for table: ' + obj);
            return;
          }
          const main = document.querySelector('.content-area');
          main.innerHTML = '<div>Loading...</div>';
          fetchWithAuth('/objectdata?object=' + encodeURIComponent(obj) + '&source=' + encodeURIComponent(sourceId))
            .then(r => r.json())
            .then(d => renderTableUI(main, d, sourceId));
        }
        
        if (window.innerWidth <= 768) {
          toggleMobileMenu();
        }
      } else if (url) {
        location.href = url;
      }
    }
  });

  window.__renderTableUI = renderTableUI;
})();