// Ícone na bandeja do sistema (Windows), sem dependências: um script PowerShell desenha o ícone
// e conversa com o app por linhas de texto (stdout = cliques do menu, stdin = balões/avisos).
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms, System.Drawing, Microsoft.VisualBasic
[System.Windows.Forms.Application]::EnableVisualStyles()

$icon = New-Object System.Windows.Forms.NotifyIcon
$base = [System.Drawing.Icon]::ExtractAssociatedIcon($env:STICKS_EXE)
$icon.Icon = $base
$icon.Text = 'Audio Sticks'
function Send($m) { [Console]::Out.WriteLine($m); [Console]::Out.Flush() }
function Quit { $icon.Visible = $false; [System.Windows.Forms.Application]::Exit() }

# Ícone com uma bolinha de status no canto (verde = WhatsApp conectado, laranja = conectando/preparando, cinza = desconectado)
# (o app só manda "state" quando algo muda, então poucos ícones são criados)
function SetDot($hex) {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.DrawIcon($base, (New-Object System.Drawing.Rectangle 0, 0, 32, 32))
  if ($hex -and $hex -ne 'none') {
    $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 16, 16, 23))), 17, 17, 15, 15)
    $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))), 19, 19, 11, 11)
  }
  $g.Dispose()
  $icon.Icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  $bmp.Dispose()
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Abrir Audio Sticks')
$open.Font = New-Object System.Drawing.Font($open.Font, [System.Drawing.FontStyle]::Bold)
$open.add_Click({ Send 'open' })
$menu.Items.Add('-') | Out-Null
# Status (atualizado pelo app): clicar abre o app
$miApp = $menu.Items.Add('Iniciando...')
$miApp.add_Click({ Send 'open' })
$miWa = $menu.Items.Add('WhatsApp: verificando...')
$miWa.add_Click({ Send 'open' })
$menu.Items.Add('-') | Out-Null
$menu.Items.Add('Abrir pasta das figurinhas').add_Click({ Send 'folder' }) | Out-Null
$menu.Items.Add('Ver registro (log)').add_Click({ Send 'log' }) | Out-Null
$menu.Items.Add('Trocar porta...').add_Click({ Send 'port' }) | Out-Null
$menu.Items.Add('-') | Out-Null
$menu.Items.Add('Reiniciar').add_Click({ Send 'restart' }) | Out-Null
$menu.Items.Add('Encerrar').add_Click({ Send 'quit'; Quit }) | Out-Null
$icon.ContextMenuStrip = $menu
$icon.add_MouseClick({ param($s, $e) if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Send 'open' } })
$icon.add_BalloonTipClicked({ Send 'open' })
$icon.Visible = $true

# Comandos do app chegam pelo stdin; se o app morrer, o stdin fecha e o ícone some junto.
# IMPORTANTE: não use [Console]::In. No Windows PowerShell ele é sincronizado, e o ReadLineAsync dele
# na verdade BLOQUEIA a interface até chegar a próxima linha (o ícone para de responder a cliques).
$reader = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), [Text.Encoding]::UTF8)
$script:task = $reader.ReadLineAsync()
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 250
$timer.add_Tick({
  while ($script:task.IsCompleted) {
    $line = $script:task.Result
    if ($null -eq $line) { Quit; return }
    $p = $line.Split('|')
    if ($p[0] -eq 'balloon') { $icon.ShowBalloonTip(5000, $p[1], $p[2], [System.Windows.Forms.ToolTipIcon]::Info) }
    elseif ($p[0] -eq 'tip') { $icon.Text = $p[1].Substring(0, [Math]::Min(63, $p[1].Length)) }
    elseif ($p[0] -eq 'exit') { Quit; return }
    elseif ($p[0] -eq 'state') {
      # state|texto do app|texto do WhatsApp|cor da bolinha|dica ao passar o mouse
      $miApp.Text = $p[1]
      $miWa.Text = $p[2]
      SetDot $p[3]
      $icon.Text = $p[4].Substring(0, [Math]::Min(63, $p[4].Length))
    }
    elseif ($p[0] -eq 'askport') {
      $nl = [Environment]::NewLine
      $msg = 'Porta atual: ' + $p[1] + $nl + $nl + 'Digite a nova porta (1024 a 65535).' + $nl + 'Use quando outro programa estiver usando a mesma porta.'
      $v = [Microsoft.VisualBasic.Interaction]::InputBox($msg, 'Audio Sticks - trocar porta', $p[1])
      if ($v) { Send ('setport|' + $v.Trim()) }
    }
    $script:task = $reader.ReadLineAsync()
  }
})
$timer.Start()
[System.Windows.Forms.Application]::Run()
$icon.Dispose()
`;

/** Liga o ícone da bandeja. Devolve null fora do Windows. */
export function startTray(handlers) {
  if (process.platform !== 'win32') return null;
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
    env: { ...process.env, STICKS_EXE: process.execPath },
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
  ps.on('error', () => {});
  ps.stdin.on('error', () => {});
  readline.createInterface({ input: ps.stdout }).on('line', (line) => {
    const [cmd, ...rest] = line.trim().split('|');
    handlers[cmd]?.(rest.join('|'));
  });
  const send = (...parts) => { try { ps.stdin.write(parts.map((p) => String(p).replace(/[|\r\n]+/g, ' ')).join('|') + '\n'); } catch { /* bandeja fechada */ } };
  return {
    balloon: (title, text) => send('balloon', title, text),
    tip: (text) => send('tip', text),
    stop: () => send('exit'),
    askPort: (current) => send('askport', current),
    /** Atualiza o status no menu, a bolinha do ícone (#hex ou 'none') e a dica do mouse. */
    state: (appText, waText, color, tip) => send('state', appText, waText, color, tip),
  };
}

/** Caixa de mensagem de erro (quando não há janela de terminal para mostrar). */
export function errorBox(message) {
  if (process.platform !== 'win32') return;
  const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($env:STICKS_MSG, 'Audio Sticks', 'OK', 'Error') | Out-Null`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      env: { ...process.env, STICKS_MSG: message }, stdio: 'ignore', windowsHide: true,
    });
    p.on('exit', resolve);
    p.on('error', resolve);
  });
}
