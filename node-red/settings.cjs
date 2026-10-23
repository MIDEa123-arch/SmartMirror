const path = require('node:path');
module.exports = {
    uiPort: Number(process.env.PORT || 1881),
    uiHost: process.env.SMARTMIRROR_HOST || '127.0.0.1',
    flowFile: path.resolve(__dirname, '../.runtime/flows.json'),
    contextStorage: { default:'memoryOnly', memoryOnly:{module:'memory'}, file:{module:'localfilesystem'} },
    editorTheme: { projects:{enabled:false} },
    logging: {console:{level:'info',metrics:false,audit:false}}
};
