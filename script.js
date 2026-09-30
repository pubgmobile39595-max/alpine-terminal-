/* ============================================================
   ALPINE LINUX TERMİNAL SİMÜLASYONU
   ============================================================ */

const screenEl = document.getElementById('screen');
const output = document.getElementById('output');
const inputBuffer = document.getElementById('inputBuffer');
const hiddenInput = document.getElementById('hiddenInput');
const promptPathEl = document.getElementById('prompt').querySelector('.p-path');

// ============================================================
// SANAL DOSYA SİSTEMİ
// ============================================================
let fsRoot = {
  type: 'dir',
  children: {
    bin: { type: 'dir', children: {
      sh: { type: 'file', content: '#!/bin/sh', exec: true },
      ls: { type: 'file', content: '', exec: true },
      apk: { type: 'file', content: '', exec: true },
    }},
    etc: { type: 'dir', children: {
      'hostname': { type: 'file', content: 'localhost' },
      'os-release': { type: 'file', content:
        'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.19.1\nPRETTY_NAME="Alpine Linux v3.19"\nHOME_URL="https://alpinelinux.org/"'
      },
      'passwd': { type: 'file', content: 'root:x:0:0:root:/root:/bin/sh' },
    }},
    home: { type: 'dir', children: {
      user: { type: 'dir', children: {} }
    }},
    root: { type: 'dir', children: {
      'welcome.txt': { type: 'file', content:
        'Alpine Linux terminaline hoş geldin!\n\nYardım için: help\nDosya oluştur: touch merhaba.txt\nPaket kur: apk add nano'
      },
      '.profile': { type: 'file', content: 'export PS1="\\u@\\h:\\w\\$ "' },
    }},
    tmp: { type: 'dir', children: {} },
    usr: { type: 'dir', children: {
      bin: { type: 'dir', children: {} },
      share: { type: 'dir', children: {} },
    }},
    var: { type: 'dir', children: {
      log: { type: 'dir', children: {
        messages: { type: 'file', content: 'system boot ok\nnetwork up\n' }
      }},
    }},
  }
};

let cwd = '/root';           // şu anki dizin
let user = 'root';
let hostname = 'localhost';
let apkInstalled = ['busybox', 'musl', 'alpine-baselayout', 'openrc', 'apk-tools'];
let apkIndex = [
  'nano', 'vim', 'git', 'curl', 'wget', 'htop', 'python3', 'nodejs', 'npm',
  'nginx', 'sqlite', 'redis', 'postgresql', 'docker', 'bash', 'zsh', 'tmux',
  'gcc', 'make', 'cargo', 'go', 'rust', 'ffmpeg', 'imagemagick'
];

// ============================================================
// FS YARDIMCILARI
// ============================================================
function resolvePath(path) {
  if (!path) return cwd;
  let parts;
  if (path.startsWith('/')) parts = path.split('/').filter(Boolean);
  else parts = (cwd + '/' + path).split('/').filter(Boolean);
  const stack = [];
  for (const p of parts) {
    if (p === '.') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return '/' + stack.join('/');
}

function getNode(path) {
  const parts = path.split('/').filter(Boolean);
  let node = fsRoot;
  for (const p of parts) {
    if (!node.children || !node.children[p]) return null;
    node = node.children[p];
  }
  return node;
}

function getParent(path) {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return null;
  const name = parts.pop();
  const parentPath = '/' + parts.join('/');
  return { parent: getNode(parentPath), name };
}

function createNode(path, type, content = '') {
  const info = getParent(path);
  if (!info || !info.parent || info.parent.type !== 'dir') {
    return { ok: false, msg: `mkdir: cannot create '${path}': No such file or directory` };
  }
  if (info.parent.children[info.name]) {
    return { ok: false, msg: `${type === 'dir' ? 'mkdir' : 'touch'}: '${path}': File exists` };
  }
  info.parent.children[info.name] = { type, content, children: type === 'dir' ? {} : undefined };
  return { ok: true };
}

function removeNode(path, recursive = false) {
  const info = getParent(path);
  if (!info || !info.parent || !info.parent.children[info.name]) {
    return { ok: false, msg: `rm: cannot remove '${path}': No such file or directory` };
  }
  const node = info.parent.children[info.name];
  if (node.type === 'dir' && !recursive) {
    return { ok: false, msg: `rm: cannot remove '${path}': Is a directory` };
  }
  delete info.parent.children[info.name];
  return { ok: true };
}

// ============================================================
// ÇIKTI YARDIMCILARI
// ============================================================
function print(html) {
  const div = document.createElement('div');
  div.className = 'line';
  div.innerHTML = html;
  output.appendChild(div);
  scrollBottom();
}

function printRaw(text) {
  const div = document.createElement('div');
  div.className = 'line';
  div.textContent = text;
  output.appendChild(div);
  scrollBottom();
}

function printBlock(html) {
  const div = document.createElement('div');
  div.className = 'line';
  div.innerHTML = html;
  output.appendChild(div);
  scrollBottom();
}

function scrollBottom() {
  setTimeout(() => screenEl.scrollTop = screenEl.scrollHeight, 10);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// ============================================================
// PROMPT GÜNCELLE
// ============================================================
function updatePrompt() {
  const shortCwd = cwd === '/' ? '/' : (cwd.startsWith('/root') ? '~' + cwd.slice(5) : cwd);
  promptPathEl.textContent = shortCwd;
  document.querySelector('.p-user').textContent = user;
  document.querySelector('.p-host').textContent = hostname;
}

// ============================================================
// KOMUTLAR
// ============================================================
const commands = {

  // ---- Yardım ----
  help: () => {
    printBlock(`
<span class="green bold">Alpine Linux Terminal — Kullanılabilir Komutlar</span>

<span class="yellow bold">📁 Dosya Sistemi</span>
  <span class="cyan">ls</span> [yol]         Dizini listele
  <span class="cyan">cd</span> [yol]         Dizin değiştir
  <span class="cyan">pwd</span>              Şu anki dizini göster
  <span class="cyan">mkdir</span> &lt;isim&gt;      Dizin oluştur
  <span class="cyan">touch</span> &lt;isim&gt;      Boş dosya oluştur
  <span class="cyan">cat</span> &lt;dosya&gt;      Dosyayı görüntüle
  <span class="cyan">rm</span> [-rf] &lt;yol&gt;    Dosya/dizin sil
  <span class="cyan">tree</span> [yol]        Ağaç yapısı göster
  <span class="cyan">find</span> &lt;isim&gt;       Dosya ara
  <span class="cyan">wc</span> &lt;dosya&gt;       Kelime/satır say
  <span class="cyan">head</span>/<span class="cyan">tail</span> &lt;dosya&gt; İlk/son satırlar

<span class="yellow bold">📦 Paket Yönetimi (apk)</span>
  <span class="cyan">apk search</span> &lt;q&gt;    Paket ara
  <span class="cyan">apk add</span> &lt;p&gt;       Paket kur
  <span class="cyan">apk del</span> &lt;p&gt;       Paket kaldır
  <span class="cyan">apk update</span>        Paket listesini güncelle
  <span class="cyan">apk upgrade</span>       Sistemi güncelle
  <span class="cyan">apk info</span>          Kurulu paketleri göster

<span class="yellow bold">🖥️ Sistem</span>
  <span class="cyan">whoami</span>            Aktif kullanıcı
  <span class="cyan">hostname</span>          Sunucu adı
  <span class="cyan">date</span>              Tarih/saat
  <span class="cyan">uname</span> [-a]         Sistem bilgisi
  <span class="cyan">neofetch</span>          Sistem özeti
  <span class="cyan">top</span> / <span class="cyan">ps</span>         Çalışan işlemler
  <span class="cyan">free</span>              Bellek durumu

<span class="yellow bold">🛠️ Yardımcı</span>
  <span class="cyan">echo</span> [metin]      Metin yazdır
  <span class="cyan">clear</span>             Ekranı temizle
  <span class="cyan">history</span>           Komut geçmişi
  <span class="cyan">man</span> &lt;komut&gt;       Komut kılavuzu
  <span class="cyan">reboot</span>            Yeniden başlat (simüle)
  <span class="cyan">exit</span>              Çıkış

<span class="dim">İpucu: ↑/↓ ok tuşları komut geçmişi, Tab otomatik tamamlar, Ctrl+L temizler.</span>
    `);
  },

  // ---- Dosya Sistemi ----
  ls: (args) => {
    const showAll = args.includes('-a') || args.includes('-la') || args.includes('-al');
    const target = args.find(a => !a.startsWith('-')) || '.';
    const path = resolvePath(target);
    const node = getNode(path);
    if (!node) return print(`<span class="red">ls: cannot access '${target}': No such file or directory</span>`);
    if (node.type === 'file') return print(`<span class="white">${target}</span>`);

    let items = Object.keys(node.children || {});
    if (!showAll) items = items.filter(i => !i.startsWith('.'));

    if (!items.length) return;

    // Renkli listeleme (flex grid)
    let html = '<div class="ls-grid">';
    items.sort().forEach(name => {
      const child = node.children[name];
      let cls = child.type === 'dir' ? 'dir' : (child.exec ? 'exec' : '');
      if (name.startsWith('.')) cls = 'dim';
      html += `<span class="${cls}">${escapeHtml(name)}${child.type === 'dir' ? '/' : ''}</span>`;
    });
    html += '</div>';
    printBlock(html);
  },

  cd: (args) => {
    const target = args[0] || '/root';
    if (target === '-') {
      cwd = previousCwd || '/root';
      updatePrompt();
      return;
    }
    const path = resolvePath(target);
    const node = getNode(path);
    if (!node) return print(`<span class="red">cd: ${target}: No such file or directory</span>`);
    if (node.type !== 'dir') return print(`<span class="red">cd: ${target}: Not a directory</span>`);
    previousCwd = cwd;
    cwd = path;
    updatePrompt();
  },

  pwd: () => print(cwd),

  mkdir: (args) => {
    const name = args.find(a => !a.startsWith('-'));
    if (!name) return print(`<span class="red">mkdir: missing operand</span>`);
    const res = createNode(resolvePath(name), 'dir');
    if (!res.ok) print(`<span class="red">${res.msg}</span>`);
  },

  touch: (args) => {
    const name = args[0];
    if (!name) return print(`<span class="red">touch: missing operand</span>`);
    const res = createNode(resolvePath(name), 'file');
    if (!res.ok) print(`<span class="red">${res.msg}</span>`);
  },

  cat: (args) => {
    if (!args.length) return print(`<span class="red">cat: missing operand</span>`);
    args.forEach(name => {
      const node = getNode(resolvePath(name));
      if (!node) return print(`<span class="red">cat: ${name}: No such file or directory</span>`);
      if (node.type === 'dir') return print(`<span class="red">cat: ${name}: Is a directory</span>`);
      printRaw(node.content || '');
    });
  },

  rm: (args) => {
    const recursive = args.includes('-rf') || args.includes('-r') || args.includes('-fr');
    const targets = args.filter(a => !a.startsWith('-'));
    if (!targets.length) return print(`<span class="red">rm: missing operand</span>`);
    targets.forEach(t => {
      const res = removeNode(resolvePath(t), recursive);
      if (!res.ok) print(`<span class="red">${res.msg}</span>`);
    });
  },

  tree: (args) => {
    const target = args[0] || '.';
    const startPath = resolvePath(target);
    const startNode = getNode(startPath);
    if (!startNode) return print(`<span class="red">tree: ${target}: No such file or directory</span>`);
    let lines = [`<span class="blue bold">${target}</span>`];
    let dirCount = 0, fileCount = 0;

    function walk(node, prefix) {
      const items = Object.keys(node.children || {}).sort();
      items.forEach((name, i) => {
        const isLast = i === items.length - 1;
        const child = node.children[name];
        const branch = isLast ? '└── ' : '├── ';
        if (child.type === 'dir') {
          dirCount++;
          lines.push(prefix + branch + `<span class="blue bold">${name}</span>`);
          walk(child, prefix + (isLast ? '    ' : '│   '));
        } else {
          fileCount++;
          lines.push(prefix + branch + `<span>${name}</span>`);
        }
      });
    }
    walk(startNode, '');
    printBlock(lines.join('\n'));
    print(`<span class="dim">\n${dirCount} directories, ${fileCount} files</span>`);
  },

  find: (args) => {
    const q = args[0];
    if (!q) return print(`<span class="red">find: missing argument</span>`);
    let results = [];
    function walk(node, path) {
      Object.keys(node.children || {}).forEach(name => {
        const child = node.children[name];
        const full = path + '/' + name;
        if (name.includes(q)) results.push(full);
        if (child.type === 'dir') walk(child, full);
      });
    }
    walk(fsRoot, '');
    if (!results.length) print(`<span class="dim">Sonuç bulunamadı.</span>`);
    else results.forEach(r => print(r));
  },

  wc: (args) => {
    const name = args[0];
    if (!name) return print(`<span class="red">wc: missing operand</span>`);
    const node = getNode(resolvePath(name));
    if (!node || node.type !== 'file') return print(`<span class="red">wc: ${name}: No such file</span>`);
    const lines = node.content.split('\n').length;
    const words = node.content.split(/\s+/).filter(Boolean).length;
    const chars = node.content.length;
    print(`  ${lines}  ${words}  ${chars}  ${name}`);
  },

  head: (args) => {
    const name = args[0];
    if (!name) return print(`<span class="red">head: missing operand</span>`);
    const node = getNode(resolvePath(name));
    if (!node || node.type !== 'file') return print(`<span class="red">head: ${name}: No such file</span>`);
    printRaw(node.content.split('\n').slice(0, 10).join('\n'));
  },

  tail: (args) => {
    const name = args[0];
    if (!name) return print(`<span class="red">tail: missing operand</span>`);
    const node = getNode(resolvePath(name));
    if (!node || node.type !== 'file') return print(`<span class="red">tail: ${name}: No such file</span>`);
    printRaw(node.content.split('\n').slice(-10).join('\n'));
  },

  // ---- apk (paket yöneticisi) ----
  apk: (args) => {
    const sub = args[0];
    if (!sub) {
      print(`<span class="yellow">apk-tools 2.14.4, compiled for Alpine Linux</span>`);
      print(`Kullanım: apk [search|add|del|update|upgrade|info|list]`);
      return;
    }
    if (sub === 'search') {
      const q = args[1];
      if (!q) return print(`<span class="red">apk search: missing query</span>`);
      const results = apkIndex.filter(p => p.includes(q) && !apkInstalled.includes(p));
      print(`<span class="dim">Fetching index...</span>`);
      setTimeout(() => {
        if (!results.length) print(`<span class="dim">Eşleşme yok.</span>`);
        else results.forEach(p => print(`<span class="green">${p}</span>`));
      }, 300);
    } else if (sub === 'add') {
      const pkgs = args.slice(1).filter(a => !a.startsWith('-'));
      if (!pkgs.length) return print(`<span class="red">apk add: missing package name</span>`);
      print(`<span class="dim">(1/1) Installing ${pkgs.join(' ')}...</span>`);
      setTimeout(() => {
        pkgs.forEach(p => {
          if (apkIndex.includes(p) || apkInstalled.includes(p)) {
            if (!apkInstalled.includes(p)) apkInstalled.push(p);
            print(`<span class="green">OK: ${p} installed</span>`);
          } else {
            print(`<span class="red">ERROR: unable to select package '${p}'</span>`);
          }
        });
        print(`<span class="dim">${pkgs.length} package(s) installed.</span>`);
      }, 600);
    } else if (sub === 'del') {
      const pkgs = args.slice(1);
      if (!pkgs.length) return print(`<span class="red">apk del: missing package name</span>`);
      pkgs.forEach(p => {
        const idx = apkInstalled.indexOf(p);
        if (idx >= 0) {
          apkInstalled.splice(idx, 1);
          print(`<span class="green">OK: ${p} purged</span>`);
        } else print(`<span class="red">${p} is not installed</span>`);
      });
    } else if (sub === 'update') {
      print(`<span class="dim">fetch https://dl-cdn.alpinelinux.org/alpine/v3.19/main/x86_64/APKINDEX.tar.gz</span>`);
      setTimeout(() => {
        print(`<span class="green">OK: 12345 packages available</span>`);
      }, 700);
    } else if (sub === 'upgrade') {
      print(`<span class="dim">Upgrading system...</span>`);
      setTimeout(() => {
        print(`<span class="green">OK: 42 packages upgraded</span>`);
      }, 900);
    } else if (sub === 'info') {
      if (args[1]) {
        const p = args[1];
        if (apkInstalled.includes(p)) {
          print(`<span class="cyan">${p}</span> - installed package`);
          print(`Description: ${p} binary`);
          print(`Size: ~${Math.floor(Math.random() * 5000 + 200)} KB`);
        } else print(`<span class="red">${p}: not installed</span>`);
      } else {
        apkInstalled.forEach(p => print(`<span class="green">${p}</span>`));
      }
    } else {
      print(`<span class="red">apk: invalid subcommand '${sub}'</span>`);
    }
  },

  // ---- Sistem ----
  whoami: () => print(user),
  hostname: () => print(hostname),
  date: () => print(new Date().toString()),
  uname: (args) => {
    if (args.includes('-a')) print('Linux localhost 6.6.0-alpine #1 SMP x86_64 GNU/Linux');
    else print('Linux');
  },

  neofetch: () => {
    const now = new Date();
    printBlock(`<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">
      <pre class="ascii">   /\\ /\\
  / \\  / \\      _
 /   \\/   \\   _| |_
/          \\ |_   _|
\\          /   |_|
 \\        /    (_)
  \\______/
      </pre>
      <div>
        <div><span class="green bold">root</span><span class="dim">@</span><span class="cyan bold">localhost</span></div>
        <div class="dim">─────────────────</div>
        <div><span class="green bold">OS:</span> Alpine Linux 3.19.1 x86_64</div>
        <div><span class="green bold">Host:</span> Web Terminal (JS)</div>
        <div><span class="green bold">Kernel:</span> 6.6.0-alpine</div>
        <div><span class="green bold">Uptime:</span> ${Math.floor(performance.now() / 1000)} sn</div>
        <div><span class="green bold">Packages:</span> ${apkInstalled.length} (apk)</div>
        <div><span class="green bold">Shell:</span> /bin/sh</div>
        <div><span class="green bold">Terminal:</span> web-term</div>
        <div><span class="green bold">CPU:</span> Virtual JS</div>
        <div><span class="green bold">Memory:</span> ${(Math.random() * 30 + 40).toFixed(0)} MiB / 128 MiB</div>
        <div style="margin-top:6px">
          <span style="background:#000;color:#0f0">   </span>
          <span style="background:#f00;color:#f00">   </span>
          <span style="background:#0f0;color:#0f0">   </span>
          <span style="background:#ff0;color:#ff0">   </span>
          <span style="background:#00f;color:#00f">   </span>
          <span style="background:#f0f;color:#f0f">   </span>
          <span style="background:#0ff;color:#0ff">   </span>
          <span style="background:#fff;color:#fff">   </span>
        </div>
      </div>
    </div>`);
  },

  top: () => {
    print(`<span class="dim">PID   USER    CPU%  MEM%  COMMAND</span>`);
    const procs = [
      ['1', 'root', '0.0', '0.2', 'init'],
      ['42', 'root', '0.1', '0.3', 'rc-service'],
      ['128', 'root', '0.3', '1.1', 'sshd'],
      ['256', 'root', '0.0', '0.4', 'crond'],
      ['512', 'root', '1.2', '2.5', 'web-term'],
      ['640', 'root', '0.5', '0.8', 'sh'],
    ];
    procs.forEach(p => print(`  ${p[0].padEnd(6)}${p[1].padEnd(8)}${p[2].padEnd(6)}${p[3].padEnd(6)}${p[4]}`));
    print(`<span class="dim">\nÇıkmak için: q (bir sonraki komutta)</span>`);
  },

  ps: () => {
    print(`  PID TTY          TIME CMD`);
    print(`    1 ?        00:00:00 init`);
    print(`  512 ?        00:00:01 web-term`);
    print(`  640 ?        00:00:00 sh`);
  },

  free: () => {
    print(`              total        used        free      shared 
