(() => {
    'use strict';

    const raw = (repo, path) => 'https://raw.githubusercontent.com/' + repo + '/main/' + path;
    const cdn = (repo, path) => 'https://cdn.jsdelivr.net/gh/' + repo + '@main/' + path;
    const sources = [
        {
            id: 'youmind', name: 'YouMind 图片精选', repo: 'YouMind-OpenLab/ai-image-prompts-skill',
            files: [
                ['references/ecommerce-main-image.json', '电商主图'],
                ['references/poster-flyer.json', '海报'],
                ['references/comic-storyboard.json', '漫画分镜'],
                ['references/infographic-edu-visual.json', '信息图']
            ]
        },
        {
            id: 'shuixian', name: '水仙 AI 提示词', repo: 'BaYue-SYJ/shuixian-prompts',
            files: [1, 2, 3].map(number => ['shuixian-unified/data/prompts.part' + number + '.json']),
            imageBase: 'https://r2.qqsrc.com/'
        },
        {
            id: 'gpt-image', name: 'Awesome GPT Image', repo: 'freestylefly/awesome-gpt-image-2',
            files: [['data/cases.json']], base: 'data/'
        },
        {
            id: 'seedance', name: 'LearnPrompt Seedance', repo: 'LearnPrompt/awesome-seedance',
            files: [['data/cases.json', '视频']], kind: 'video'
        }
    ];

    function string(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    function https(value, base) {
        if (!string(value)) return '';
        try {
            const url = new URL(/^https:/i.test(value) || !base ? value : value.replace(/^\/+/, ''), base);
            return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
        } catch {
            return '';
        }
    }

    function parse(payload, source, category) {
        const list = Array.isArray(payload) ? payload : payload?.cases || payload?.prompts;
        if (!Array.isArray(list)) throw new Error('无法读取案例数据');
        const base = source.imageBase || (source.base ? cdn(source.repo, source.base) : undefined);
        const items = [];
        for (const row of list) {
            if (!row || typeof row !== 'object') continue;
            const prompt = string(row.promptFull || row.prompt || row.content);
            if (!prompt) continue;
            const image = https(row.posterUrl || row.thumb || row.image || row.sourceMedia?.[0], base);
            const video = source.kind === 'video' ? https(row.mediaUrl) : '';
            items.push({
                id: source.id + '/' + (row.id ?? row.slug ?? items.length),
                source: source.id, kind: source.kind || 'image',
                title: string(row.title) || prompt.slice(0, 42),
                category: category || string(row.category),
                prompt, image, video,
                author: string(row.creator || row.sourceLabel),
                original: https(row.sourceUrl || row.tweet),
                page: https(row.githubUrl || row.goodcaseUrl) || 'https://github.com/' + source.repo
            });
        }
        if (!items.length) throw new Error('上游没有返回可用案例');
        return items;
    }

    const catalog = new Map();
    const subscribers = new Set();
    let opening;
    let refreshing;
    let lastRefresh = 0;
    let unavailable = 0;

    function database() {
        if (!opening) opening = new Promise(resolve => {
            try {
                const request = indexedDB.open('noxflash-inspiration', 1);
                request.onupgradeneeded = () => request.result.createObjectStore('sources', { keyPath: 'id' });
                request.onsuccess = () => resolve(request.result);
                request.onerror = request.onblocked = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
        return opening;
    }

    async function readCache() {
        const db = await database();
        if (!db) return;
        await new Promise(resolve => {
            const request = db.transaction('sources').objectStore('sources').getAll();
            request.onsuccess = () => {
                for (const record of request.result) {
                    if (!catalog.has(record.id) && Array.isArray(record.items)) catalog.set(record.id, record.items);
                }
                resolve();
            };
            request.onerror = () => resolve();
        });
    }

    async function writeCache(id, items) {
        const db = await database();
        if (!db) return;
        await new Promise(resolve => {
            const transaction = db.transaction('sources', 'readwrite');
            transaction.oncomplete = transaction.onabort = transaction.onerror = () => resolve();
            transaction.objectStore('sources').put({ id, items });
        });
    }

    const cacheReady = readCache().catch(() => {});
    const publish = () => subscribers.forEach(listener => listener());
    const favoritesKey = 'noxflash:inspiration-favorites';
    const favoritesChanged = 'noxflash-inspiration-favorites';

    function readFavorites() {
        try {
            const saved = JSON.parse(localStorage.getItem(favoritesKey));
            if (Array.isArray(saved?.items) && Array.isArray(saved?.categories)) return saved;
        } catch {}
        return { items: [], categories: [] };
    }

    function saveFavorites(change) {
        const saved = readFavorites();
        change(saved);
        localStorage.setItem(favoritesKey, JSON.stringify(saved));
        window.dispatchEvent(new Event(favoritesChanged));
    }

    async function readShard(source, path, category) {
        for (const url of [raw(source.repo, path), cdn(source.repo, path)]) {
            try {
                const response = await fetch(url, {
                    signal: AbortSignal.timeout(12000), credentials: 'omit', cache: 'no-cache', referrerPolicy: 'no-referrer'
                });
                if (response.ok) return parse(await response.json(), source, category);
            } catch {
                // Try the public mirror when the primary cannot load or parse the shard.
            }
        }
        throw new Error(source.name + ' 暂时无法加载');
    }

    function refresh(force = false) {
        if (refreshing) return refreshing;
        if (!force && Date.now() - lastRefresh < 60000) return Promise.resolve();
        refreshing = (async () => {
            await cacheReady;
            unavailable = 0;
            publish();
            await Promise.all(sources.map(async source => {
                const shards = await Promise.allSettled(source.files.map(([path, category]) => readShard(source, path, category)));
                const items = shards.flatMap(result => result.status === 'fulfilled' ? result.value : []);
                const failed = shards.some(result => result.status === 'rejected');
                if (failed) unavailable++;
                if (items.length) {
                    const previous = failed ? catalog.get(source.id) || [] : [];
                    const unique = new Map([...previous, ...items].map(item => [item.id, item]));
                    catalog.set(source.id, [...unique.values()]);
                    await writeCache(source.id, catalog.get(source.id)).catch(() => {});
                }
                publish();
            }));
            lastRefresh = Date.now();
        })().finally(() => {
            refreshing = null;
            publish();
        });
        return refreshing;
    }

    const el = (tag, className, value) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (value) node.textContent = value;
        return node;
    };
    const button = (label, action) => {
        const node = el('button', '', label);
        node.type = 'button';
        node.onclick = action;
        return node;
    };
    // Use the existing Vue HomePage styles for the embedded gallery.
    const homeElement = (tag, className, value) => {
        const node = el(tag, className, value);
        node.setAttribute('data-v-09b8dd64', '');
        return node;
    };
    function star() {
        const ns = 'http://www.w3.org/2000/svg';
        const icon = document.createElementNS(ns, 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', 'currentColor');
        icon.setAttribute('stroke-width', '1.7');
        icon.setAttribute('stroke-linejoin', 'round');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z');
        icon.append(path);
        return icon;
    }

    function image(item) {
        const node = el('img');
        node.alt = '';
        node.loading = 'lazy';
        node.decoding = 'async';
        node.referrerPolicy = 'no-referrer';
        if (item.image) node.src = item.image;
        node.onerror = () => { node.hidden = true; };
        return node;
    }

    class InspirationLibrary extends HTMLElement {
        connectedCallback() {
            if (this.initialized) return;
            this.initialized = true;
            this.home = this.hasAttribute('data-home');
            this.libraryPage = this.hasAttribute('data-library-page');
            this.favoritesOnly = false;
            this.saved = readFavorites();
            this.kind = '';
            this.pageSize = this.home ? 15 : 24;
            this.limit = this.pageSize;
            this.classList.add('nf-inspiration');
            if (this.home) this.classList.add('nfi-home');
            const make = this.home ? homeElement : el;
            const heading = make('div', this.home ? 'hp-tpl-head nfi-heading' : 'nfi-heading');
            heading.append(make('h2', '', '灵感库'));
            this.refreshButton = button('刷新', () => refresh(true));
            this.refreshButton.className = 'nfi-refresh';
            const tools = make('div', this.home ? 'nfi-tools nfi-home-tools' : 'nfi-tools');
            this.tabs = [['', '全部'], ['image', '图片'], ['video', '视频']].map(([kind, label]) =>
                button(label, () => { this.kind = kind; this.limit = this.pageSize; this.render(); }));
            if (this.home) {
                const tabs = make('div', 'hp-tabs');
                for (const tab of this.tabs) tab.setAttribute('data-v-09b8dd64', '');
                tabs.append(...this.tabs);
                tools.append(tabs);
            } else {
                tools.append(...this.tabs);
            }
            if (this.libraryPage) {
                const views = homeElement('div', 'hp-tabs nfi-views');
                this.viewButtons = ['全部案例', '我的收藏'].map((label, index) => {
                    const tab = homeElement('button', '', label);
                    tab.type = 'button';
                    tab.onclick = () => {
                        this.favoritesOnly = index === 1;
                        this.kind = this.source.value = this.query.value = '';
                        this.categoryFilter.value = '';
                        this.limit = this.pageSize;
                        this.categoryForm.hidden = true;
                        this.render();
                    };
                    return tab;
                });
                views.append(...this.viewButtons);
                heading.append(views);
            }
            this.source = el('select');
            this.source.setAttribute('aria-label', '案例来源');
            this.source.add(new Option('全部来源', ''));
            for (const source of sources) this.source.add(new Option(source.name, source.id));
            this.source.onchange = () => { this.limit = this.pageSize; this.render(); };
            this.query = make('input');
            this.query.type = 'search';
            this.query.placeholder = '搜索案例或提示词';
            this.query.setAttribute('aria-label', this.query.placeholder);
            this.query.oninput = () => {
                clearTimeout(this.searchTimer);
                this.searchTimer = setTimeout(() => { this.limit = this.pageSize; this.render(); }, 140);
            };
            if (this.home) {
                const search = make('label', 'hp-tpl-search');
                search.append(this.query);
                tools.append(this.source, search, this.refreshButton);
                heading.append(tools);
            } else {
                heading.append(this.refreshButton);
                tools.append(this.source, this.query);
            }
            this.status = el('p', 'nfi-status');
            this.status.setAttribute('role', 'status');
            this.grid = make('div', this.home ? 'hp-grid' : 'nfi-grid');
            this.sentinel = el('div', 'nfi-sentinel');
            this.sentinel.setAttribute('aria-hidden', 'true');
            this.list = el('div', 'nfi-list');
            if (!this.home) this.list.append(tools);
            if (this.libraryPage) this.list.append(this.categoryTools());
            this.list.append(this.status, this.grid, this.sentinel);
            this.detail = el('div', 'nfi-detail');
            this.detail.hidden = true;
            this.append(heading, this.list, this.detail);
            this.update = () => this.render();
            subscribers.add(this.update);
            this.syncFavorites = event => {
                if (event.type === 'storage' && event.key !== favoritesKey && event.key !== null) return;
                this.saved = readFavorites();
                if (this.favoritesOnly) this.render();
                this.querySelectorAll('[data-nfi-favorite]').forEach(control => this.paintFavorite(control));
                this.querySelectorAll('[data-nfi-category]').forEach(select => {
                    const favorite = this.saved.items.find(item => item.id === select.dataset.nfiCategory);
                    select.parentElement.hidden = !favorite;
                    this.fillCategories(select, favorite?.folder || '', '未分类');
                });
            };
            window.addEventListener(favoritesChanged, this.syncFavorites);
            window.addEventListener('storage', this.syncFavorites);
            this.scrollObserver = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting || this.sentinel.hidden || this.list.hidden) return;
                this.limit += this.pageSize;
                this.render(true);
            });
            this.scrollObserver.observe(this.sentinel);
            this.render();
            refresh();
        }

        disconnectedCallback() {
            subscribers.delete(this.update);
            window.removeEventListener(favoritesChanged, this.syncFavorites);
            window.removeEventListener('storage', this.syncFavorites);
            this.scrollObserver?.disconnect();
            clearTimeout(this.searchTimer);
            this.initialized = false;
            this.replaceChildren();
        }

        categoryTools() {
            const controls = el('div', 'nfi-categories nfi-tools');
            this.categoryControls = controls;
            this.categoryFilter = el('select');
            this.categoryFilter.setAttribute('aria-label', '收藏分类');
            this.categoryFilter.onchange = () => { this.limit = this.pageSize; this.render(); };
            const form = el('form', 'nfi-category-form');
            this.categoryForm = form;
            form.hidden = true;
            const name = el('input');
            name.required = true;
            name.maxLength = 24;
            name.placeholder = '分类名称';
            name.setAttribute('aria-label', '分类名称');
            name.oninput = () => name.setCustomValidity('');
            const open = button('新建分类', () => { form.hidden = false; name.focus(); });
            const save = el('button', '', '创建');
            save.type = 'submit';
            const cancel = button('取消', () => { form.hidden = true; name.value = ''; open.focus(); });
            form.onsubmit = event => {
                event.preventDefault();
                const title = name.value.trim();
                if (!title) {
                    name.setCustomValidity('请输入分类名称');
                    name.reportValidity();
                    return;
                }
                try {
                    saveFavorites(saved => {
                        if (saved.categories.some(category => category.name.toLowerCase() === title.toLowerCase())) throw Error('这个分类已存在');
                        saved.categories.push({ id: crypto.randomUUID(), name: title });
                    });
                    form.hidden = true;
                    name.value = '';
                    open.focus();
                } catch (error) {
                    name.setCustomValidity(error.name === 'QuotaExceededError' ? '无法保存分类' : error.message);
                    name.reportValidity();
                }
            };
            form.append(name, save, cancel);
            controls.append(this.categoryFilter, open, form);
            return controls;
        }

        fillCategories(select, value, placeholder, filter = false) {
            select.replaceChildren(new Option(placeholder, ''));
            if (filter) select.add(new Option('未分类', 'uncategorized'));
            for (const category of this.saved.categories) select.add(new Option(category.name, category.id));
            select.value = [...select.options].some(option => option.value === value) ? value : '';
        }

        render(append = false) {
            this.refreshButton.hidden = this.favoritesOnly;
            this.refreshButton.disabled = Boolean(refreshing);
            this.viewButtons?.forEach((tab, index) => {
                const selected = this.favoritesOnly === (index === 1);
                tab.setAttribute('aria-pressed', String(selected));
                tab.classList.toggle('on', selected);
            });
            if (this.categoryControls) {
                this.categoryControls.hidden = !this.favoritesOnly;
                if (this.favoritesOnly) this.fillCategories(this.categoryFilter, this.categoryFilter.value, '全部分类', true);
            }
            this.tabs.forEach((tab, index) => {
                const selected = this.kind === ['', 'image', 'video'][index];
                tab.setAttribute('aria-pressed', String(selected));
                tab.classList.toggle('on', selected);
            });
            const query = this.query.value.trim().toLocaleLowerCase();
            const lists = this.favoritesOnly ? [this.saved.items.filter(item => {
                const filter = this.categoryFilter.value;
                return !filter || (filter === 'uncategorized' ? !item.folder : item.folder === filter);
            })] : sources
                .filter(source => !this.source.value || source.id === this.source.value)
                .map(source => catalog.get(source.id) || []);
            const matched = lists.map(items => items.filter(item =>
                (!this.kind || this.kind === item.kind) &&
                (!this.source.value || item.source === this.source.value) &&
                (!query || [item.title, item.category, item.prompt].some(value => value.toLocaleLowerCase().includes(query)))));
            const count = matched.reduce((total, items) => total + items.length, 0);
            const visible = [];
            for (let row = 0; row < Math.max(0, ...matched.map(items => items.length)) && visible.length < this.limit; row++) {
                for (const items of matched) if (items[row]) visible.push(items[row]);
            }
            const cards = visible.slice(0, this.limit);
            this.grid.classList.toggle('is-search', this.home && !this.favoritesOnly && Boolean(query));
            const start = append ? this.grid.childElementCount : 0;
            const elements = cards.slice(start).map((item, index) => this.home
                ? this.homeCard(item, index + start, cards.length, query) : this.card(item));
            if (append) this.grid.append(...elements);
            else this.grid.replaceChildren(...elements);
            this.sentinel.hidden = count <= this.limit;
            this.status.textContent = this.favoritesOnly
                ? count ? count.toLocaleString('zh-CN') + ' 个收藏' : this.saved.items.length ? '这个分类下没有匹配的收藏。' : '点击案例右上角的星星，即可收藏。'
                : count
                ? count.toLocaleString('zh-CN') + ' 个案例' + (refreshing ? ' · 正在更新' : unavailable ? ' · 部分来源暂不可用，已保留本地缓存' : '')
                : refreshing ? '正在读取上游案例…' : unavailable ? '暂时无法读取案例，请刷新重试。' : '没有找到匹配的案例。';
        }

        card(item) {
            const card = button('', () => this.showCase(item, card));
            card.className = 'nfi-card';
            const media = el('span', 'nfi-cover', item.kind === 'video' ? '视频' : '图片');
            if (item.image) media.append(image(item));
            card.append(media, el('strong', '', item.title),
                el('span', 'nfi-meta', item.category || sources.find(source => source.id === item.source).name));
            return card;
        }

        paintFavorite(control) {
            const saved = this.saved.items.some(item => item.id === control.dataset.nfiFavorite);
            const action = saved ? '取消收藏' : '收藏';
            control.setAttribute('aria-pressed', String(saved));
            control.setAttribute('aria-label', action + '：' + control.dataset.caseTitle);
            control.title = action;
        }

        favoriteButton(item, className) {
            const control = button('', () => {
                try {
                    saveFavorites(saved => {
                        const index = saved.items.findIndex(favorite => favorite.id === item.id);
                        if (index < 0) saved.items.unshift({ ...item, folder: '' });
                        else saved.items.splice(index, 1);
                    });
                } catch {
                    this.status.textContent = '收藏保存失败，请检查本地存储空间。';
                }
            });
            control.className = className;
            control.dataset.nfiFavorite = item.id;
            control.dataset.caseTitle = item.title;
            control.append(star());
            this.paintFavorite(control);
            return control;
        }

        homeCard(item, index, count, searching) {
            const slot = index % 5;
            const row = count - index + slot;
            const size = row >= 5 ? (slot < 2 ? 'wide' : 'small') : row === 1 ? 'full' : row === 3 ? 'third' : 'half';
            const variant = this.favoritesOnly ? ' is-small' : searching ? '' : ' is-' + size;
            const card = homeElement('article', 'hp-card' + variant);
            const source = sources.find(source => source.id === item.source);
            const poster = image(item);
            if (index < 5) poster.loading = 'eager';
            poster.setAttribute('data-v-09b8dd64', '');
            const caption = homeElement('span', 't');
            caption.append(homeElement('b', '', item.title), homeElement('small', '', source.name));
            const preview = button('', () => this.showCase(item, preview));
            preview.className = 'nfi-card nfi-home-hit';
            preview.setAttribute('aria-label', item.title);
            if (item.image) card.append(poster);
            const folder = this.favoritesOnly && this.saved.categories.find(category => category.id === item.folder);
            card.append(homeElement('span', 'tag', folder?.name || item.category || (item.kind === 'video' ? '视频' : '图片')), caption,
                preview, this.favoriteButton(item, 'nfi-card-star'));
            return card;
        }

        showCase(item, trigger) {
            const preview = this.home ? el('dialog', 'nfi-dialog nfi-home-preview') : null;
            this.list.hidden = !preview;
            const detail = preview || this.detail;
            detail.hidden = false;
            const back = button('返回案例', () => {
                if (preview) { preview.close(); return; }
                this.detail.hidden = true;
                this.detail.replaceChildren();
                this.list.hidden = false;
                if (trigger.isConnected) trigger.focus();
                else this.query.focus();
            });
            const media = item.video ? el('video') : image(item);
            if (item.video) {
                media.controls = true;
                media.playsInline = true;
                media.preload = 'metadata';
                media.poster = item.image;
                media.src = item.video;
            } else if (!item.image) media.hidden = true;
            const body = el('div', 'nfi-case');
            const content = el('div', 'nfi-copy');
            const source = sources.find(source => source.id === item.source);
            const links = el('div', 'nfi-links');
            for (const [label, href] of [[source.name, item.page], [item.author || '原案例', item.original]]) {
                if (!href) continue;
                const link = el('a', '', label);
                link.href = href;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                links.append(link);
            }
            const applyLabel = this.applyLabel || '用案例新建画布';
            const apply = button(applyLabel, async () => {
                apply.disabled = true;
                apply.textContent = this.home ? '正在创建…' : '正在应用…';
                feedback.textContent = '';
                try {
                    const result = this.onApply ? await this.onApply(item) : false;
                    if (result === false) feedback.textContent = '没有应用案例，请重试。';
                    else if (preview?.open) preview.close();
                } catch {
                    feedback.textContent = '无法应用提示词，请重试。';
                } finally {
                    apply.textContent = applyLabel;
                    apply.disabled = false;
                }
            });
            apply.className = 'nfi-primary';
            const feedback = el('span', 'nfi-meta');
            feedback.setAttribute('role', 'status');
            const copy = button('复制提示词', async () => {
                try { await navigator.clipboard.writeText(item.prompt); feedback.textContent = '已复制'; }
                catch { feedback.textContent = '复制失败，可以手动选中提示词。'; }
            });
            const actions = el('div', 'nfi-actions');
            actions.append(apply, copy);
            if (this.home) actions.append(this.favoriteButton(item, 'nfi-detail-star'));
            if (this.libraryPage) {
                const folder = el('select');
                folder.dataset.nfiCategory = item.id;
                folder.setAttribute('aria-label', '移动到收藏分类');
                const field = el('label', 'nfi-folder', '分类');
                const saved = this.saved.items.find(favorite => favorite.id === item.id);
                field.hidden = !saved;
                this.fillCategories(folder, saved?.folder || '', '未分类');
                folder.onchange = () => {
                    try {
                        saveFavorites(state => {
                            const favorite = state.items.find(candidate => candidate.id === item.id);
                            if (favorite) favorite.folder = folder.value;
                        });
                    } catch {
                        feedback.textContent = '无法保存分类。';
                    }
                };
                field.append(folder);
                actions.append(field);
            }
            actions.append(feedback);
            content.append(el('h3', '', item.title), links, actions, el('pre', '', item.prompt));
            body.append(media, content);
            detail.replaceChildren(back, body);
            if (preview) {
                preview.setAttribute('aria-label', '灵感案例');
                preview.addEventListener('click', event => { if (event.target === preview) preview.close(); });
                preview.addEventListener('close', () => {
                    preview.remove();
                    if (trigger.getClientRects().length) trigger.focus();
                    else if (this.query.getClientRects().length) this.query.focus();
                }, { once: true });
                this.append(preview);
                preview.showModal();
            }
            back.focus();
        }
    }

    customElements.define('nox-inspiration', InspirationLibrary);

    window.NoxInspiration = {
        open(anchor, onApply, label = '应用到画布') {
            const dialog = el('dialog', 'nfi-dialog');
            dialog.setAttribute('aria-label', '灵感库');
            const library = el('nox-inspiration');
            library.applyLabel = label;
            library.onApply = async item => {
                if (await onApply(item) === false) return false;
                dialog.close();
                return true;
            };
            const close = button('×', () => dialog.close());
            close.className = 'nfi-close';
            close.setAttribute('aria-label', '关闭灵感库');
            dialog.append(library, close);
            (document.querySelector('.cn-root') || document.body).append(dialog);
            let outside = false;
            dialog.addEventListener('pointerdown', event => { outside = event.target === dialog; });
            dialog.addEventListener('click', event => { if (outside && event.target === dialog) dialog.close(); });
            dialog.showModal();
            const place = () => {
                if (!anchor?.isConnected) return;
                const bounds = anchor.getBoundingClientRect();
                const width = dialog.offsetWidth;
                const left = Math.max(12, Math.min(bounds.left + (bounds.width - width) / 2, innerWidth - width - 12));
                const below = bounds.top < 240 && innerHeight - bounds.bottom > bounds.top;
                dialog.style.setProperty('--nfi-left', left + 'px');
                dialog.style.setProperty('--nfi-top', below ? (bounds.bottom + 8) + 'px' : 'auto');
                dialog.style.setProperty('--nfi-bottom', below ? 'auto' : Math.max(12, innerHeight - bounds.top + 8) + 'px');
                dialog.style.setProperty('--nfi-height', Math.max(100, (below ? innerHeight - bounds.bottom : bounds.top) - 20) + 'px');
            };
            place();
            window.addEventListener('resize', place);
            dialog.addEventListener('close', () => {
                window.removeEventListener('resize', place);
                dialog.remove();
            }, { once: true });
            return dialog;
        }
    };
})();
