import fs from 'fs';
import util from 'util';

const readFile = util.promisify(fs.readFile);

export const getArrayFromFile = async (filePath) => {
    try {
        let data = await readFile(filePath, 'utf-8');
        let lines = data.split('\n');
        // Удаление последней строки, если она пустая:
        if(lines[lines.length - 1] === '') {
            lines.pop();
        }
        return lines;
    } catch (err) {
        console.error(err);
    }
}

//module.exports = getArrayFromFile;