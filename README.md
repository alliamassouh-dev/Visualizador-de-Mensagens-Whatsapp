# Visualizador de Conversas WhatsApp

Aplicação web (HTML + JS puro, sem backend) que reconstrói conversas do WhatsApp em formato de chat.

## Como usar
Abra `index.html` no navegador (duplo clique — funciona via `file://`, sql.js está embutido em `vendor/`).
Carregue um arquivo `.sqlite` / `.db` (backup iOS `ChatStorage`) ou um `.txt` exportado do WhatsApp.

## Requisitos atendidos
| Requisito | Onde |
|---|---|
| Parsing do `.txt` (Data, Hora, Remetente, Mensagem; Android e iOS; multilinha; mídia/sistema) | `js/whatsapp-txt.js` |
| **Bônus** leitura direta de SQLite + conversão de timestamps Apple/Unix | `js/sqlite-reader.js`, `js/util.js` (`appleToDate`: +978307200 s) |
| Balões, alinhamento por usuário, nome, data/hora, separador por dia | `js/app.js`, `style.css` |
| Upload `.sqlite`/`.db` pela interface (botão ou arrastar-e-soltar) | `index.html`, `js/app.js` |
| Busca por palavras-chave (várias palavras = AND, sem acento/caixa, destaque, navegação ↑↓/Enter) | `js/app.js` |

## Detalhe importante sobre os dados
No banco anonimizado do exercício, ~60% das mensagens recebidas têm `ZMESSAGEDATE` **truncado** para um inteiro de 5 dígitos
(`timestamp ÷ 10.000`). O horário real foi perdido; a aplicação o reconstrói por interpolação entre mensagens vizinhas (`ZSORT`)
dentro da janela de ~2h46 e marca essas mensagens com `~` no horário. As suas próprias mensagens (`ZISFROMME=1`) têm horário exato.

## Limitações
Mídias (fotos/áudios) aparecem como rótulo (📷 Foto, 🎤 Áudio); o nome do arquivo no banco não casa com os arquivos da pasta `Media` do zip.
