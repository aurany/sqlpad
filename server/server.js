#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const detectPort = require('detect-port');

// Parse command line flags to see if anything special needs to happen
require('./lib/cli-flow.js');

const logger = require('./lib/logger');
const config = require('./lib/config');

const configValidations = config.getValidations();
configValidations.warnings.map(warning => logger.warn(warning));
if (configValidations.errors.length > 0) {
  configValidations.errors.forEach(error => logger.error(error));
  process.exit(1);
}

const app = require('./app')(config);

const baseUrl = config.get('baseUrl');
const ip = config.get('ip');
const port = config.get('port');
const httpsPort = config.get('port');
const certPassphrase = config.get('certPassphrase');
const keyPath = config.get('keyPath');
const certPath = config.get('certPath');
const systemdSocket = config.get('systemdSocket');
const timeoutSeconds = config.get('timeoutSeconds');

const db = require('./lib/db');

function isFdObject(ob) {
  return ob && typeof ob.fd === 'number';
}

// When --systemd-socket is passed we will try to acquire the bound socket
// directly from Systemd.
//
// More info
//
// https://github.com/rickbergfalk/sqlpad/pull/185
// https://www.freedesktop.org/software/systemd/man/systemd.socket.html
// https://www.freedesktop.org/software/systemd/man/sd_listen_fds.html
function detectPortOrSystemd(port) {
  if (systemdSocket) {
    const passedSocketCount = parseInt(process.env.LISTEN_FDS, 10) || 0;

    // LISTEN_FDS contains number of sockets passed by Systemd. At least one
    // must be passed. The sockets are set to file descriptors starting from 3.
    // We just crab the first socket from fd 3 since sqlpad binds only one
    // port.
    if (passedSocketCount > 0) {
      logger.info('Using port from Systemd');
      return Promise.resolve({ fd: 3 });
    } else {
      logger.warn(
        'Warning: Systemd socket asked but not found. Trying to bind port %d manually',
        port
      );
    }
  }

  return detectPort(port);
}

/*  Start the Server
============================================================================= */
let server;

async function startServer() {
  // determine if key pair exists for certs
  if (keyPath && certPath) {
    // https only
    const _port = await detectPortOrSystemd(httpsPort);
    if (!isFdObject(_port) && httpsPort !== _port) {
      logger.info(
        'Port %d already occupied. Using port %d instead.',
        httpsPort,
        _port
      );
      // TODO FIXME XXX  Persist the new port to the in-memory store.
      // config.set('httpsPort', _port)
    }

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const certificate = fs.readFileSync(certPath, 'utf8');
    const httpsOptions = {
      key: privateKey,
      cert: certificate,
      passphrase: certPassphrase
    };

    server = https
      .createServer(httpsOptions, app)
      .listen(_port, ip, function() {
        const hostIp = ip === '0.0.0.0' ? 'localhost' : ip;
        const url = `https://${hostIp}:${_port}${baseUrl}`;
        logger.info('Welcome to SQLPad!. Visit %s to get started', url);
      });
  } else {
    // http only
    const _port = await detectPortOrSystemd(port);
    if (!isFdObject(_port) && port !== _port) {
      logger.info(
        'Port %d already occupied. Using port %d instead.',
        port,
        _port
      );

      // TODO FIXME XXX  Persist the new port to the in-memory store.
      // config.set('port', _port)
    }
    server = http.createServer(app).listen(_port, ip, function() {
      const hostIp = ip === '0.0.0.0' ? 'localhost' : ip;
      const url = `http://${hostIp}:${_port}${baseUrl}`;
      logger.info('Welcome to SQLPad! Visit %s to get started', url);
    });
  }
  server.setTimeout(timeoutSeconds * 1000);
}

db.loadPromise.then(startServer).catch(error => {
  logger.error(error, 'Error starting SQLPad');
  process.exit(1);
});

function handleShutdownSignal(signal) {
  if (!server) {
    logger.info('Received %s, but no server to shutdown', signal);
    process.exit(0);
  } else {
    logger.info('Received %s, shutting down server...', signal);
    server.close(function() {
      process.exit(0);
    });
  }
}

process.on('SIGTERM', handleShutdownSignal);
process.on('SIGINT', handleShutdownSignal);
