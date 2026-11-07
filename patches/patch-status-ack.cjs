'use strict';

// Ack das stanzas <status> de topo no Baileys.
//
// Sem isso o WhatsApp fecha o stream com "stream errored out" / ack
// class="status": a instância continua aparecendo como "open" mas para de
// receber mensagens. Sintoma clássico - manda e some.
//
// Upstream ainda aberto, por isso o patch:
//   https://github.com/WhiskeySockets/Baileys/pull/2866
//   https://github.com/evolution-foundation/evolution-api/issues/2778
//
// Adaptado de um patch escrito para o 7.0.0-rc.9. Confirmado que o rc14
// também não traz o handler, e que as funções e a âncora continuam no
// mesmo formato.
//
// Falha fechado: qualquer divergência de versão ou de layout aborta o
// build em vez de gerar uma imagem silenciosamente sem a correção.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Versões já conferidas manualmente. Ao subir o Baileys, revise o patch
// antes de adicionar a nova versão aqui.
const VERSOES_SUPORTADAS = ['7.0.0-rc.9', '7.0.0-rc14'];

const baileysDir = process.argv[2] || '/evolution/node_modules/baileys';
const packageJson = JSON.parse(
  fs.readFileSync(path.join(baileysDir, 'package.json'), 'utf8')
);

assert(
  VERSOES_SUPORTADAS.includes(packageJson.version),
  `Baileys ${packageJson.version} não revisado para este patch. ` +
    `Suportados: ${VERSOES_SUPORTADAS.join(', ')}.`
);

const target = path.join(baileysDir, 'lib/Socket/messages-recv.js');
const source = fs.readFileSync(target, 'utf8');

assert(
  source.includes('sendMessageAck(') && source.includes('onUnexpectedError('),
  'Funções esperadas não existem no arquivo de destino.'
);
assert(source.includes('CB:notification'), 'Evento CB:notification ausente; layout incompatível.');
assert(!source.includes('CB:status'), 'CB:status já existe; remova o patch antes de atualizar.');

const anchor = /^(\s*)ws\.on\('CB:ack,class:message',/gm;
const matches = [...source.matchAll(anchor)];
assert.equal(matches.length, 1, 'Âncora do handler CB:ack,class:message não é única; abortando.');

const match = matches[0];
const indent = match[1].replace(/\n/g, '');
const newHandler = [
  indent + '// Acknowledge top-level status stanzas (Baileys PR #2866).',
  indent + "ws.on('CB:status', (node) => {",
  indent + "    sendMessageAck(node).catch(error => onUnexpectedError(error, 'acking status'));",
  indent + '});',
  '',
].join('\n');

fs.writeFileSync(target, source.slice(0, match.index) + newHandler + source.slice(match.index), 'utf8');
console.log(`Status ack patch aplicado (baileys ${packageJson.version}) em ${target}`);
