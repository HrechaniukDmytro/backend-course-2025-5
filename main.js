const http = require('node:http');
const fs = require('node:fs').promises;
const path = require('node:path');
const { program } = require('commander');
const superagent = require('superagent');

program
    .requiredOption('-h, --host <type>', 'Адреса сервера')
    .requiredOption('-p, --port <type>', 'Порт сервера')
    .requiredOption('-c, --cache <type>', 'Шлях до директорії з кешованими файлами');

program.parse(process.argv);
const options = program.opts();


const host = options.host;
const port = parseInt(options.port, 10);
const cacheDir = path.resolve(options.cache);
const httpCatHost = 'https://http.cat';

async function handleGet(req, res, statusCode) 
{
    const filePath = path.join(cacheDir, `${statusCode}.jpeg`);

    try 
    {
        const data = await fs.readFile(filePath);
        console.log(`[CACHE HIT] ${req.method} ${req.url} (з кешу)`);
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(data);
    } 
    catch (err) 
    {
        if (err.code === 'ENOENT') 
	{
            console.log(`[CACHE MISS] ${req.method} ${req.url} (запит до ${httpCatHost})`);
            await fetchFromHttpCat(res, statusCode, filePath);            
        } 
	else 
	{            
            console.error(`Помилка читання файлу: ${err.message}`);
            res.writeHead(500);
            res.end('Server Error');
        }
    }
}

async function fetchFromHttpCat(res, statusCode, filePath) 
{
    try 
    {
        const url = `${httpCatHost}/${statusCode}`;
        const response = await superagent.get(url).buffer(true);

        if (response.type !== 'image/jpeg') 
        {
            throw new Error('Отримано не jpeg');
        }

        await fs.writeFile(filePath, response.body);
        console.log(`[CACHE WRITE] ${statusCode}.jpeg збережено у кеш.`);

        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        res.end(response.body);

    } 
    catch (fetchErr) 
    {
        // Помилка запиту на http.cat (наприклад, 404)
        console.error(`Помилка при запиті до http.cat: ${fetchErr.message}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
}

async function handlePut(req, res, statusCode) 
{
    const filePath = path.join(cacheDir, `${statusCode}.jpeg`);
    
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    
    req.on('end', async () => {
        try 
        {
            const data = Buffer.concat(chunks);
            await fs.writeFile(filePath, data);
            
            console.log(`[CACHE WRITE] ${req.method} ${req.url} (створено/оновлено ${statusCode}.jpeg)`);
            res.writeHead(201, { 'Content-Type': 'text/plain' });
            res.end('Created/Updated');
        } 
        catch (err) 
        {
            console.error(`Помилка запису файлу: ${err.message}`);
            res.writeHead(500);
            res.end('Server Error');
        }
    });
}

async function handleDelete(req, res, statusCode) 
{
    const filePath = path.join(cacheDir, `${statusCode}.jpeg`);

    try 
    {
        await fs.unlink(filePath); // Видаляємо файл
        console.log(`[CACHE DELETE] ${req.method} ${req.url} (видалено ${statusCode}.jpeg)`);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Deleted');
    } 
    catch (err) 
    {
        if (err.code === 'ENOENT') 
        {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        } 
        else 
        {
            console.error(`Помилка видалення файлу: ${err.message}`);
            res.writeHead(500);
            res.end('Server Error');
        }
    }
}

async function startServer() 
{
    try 
    {
        await fs.mkdir(cacheDir, { recursive: true });
    }  
    catch (err) 
    {
        console.error(`Помилка при створенні директорії кешу: ${err.message}`);
        process.exit(1);
    }

    const server = http.createServer(async (req, res) => 
    {
        const urlMatch = req.url.match(/\/(\d{3})$/);

        if (!urlMatch) 
        {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request. Очікується URL у форматі /<statusCode>');
            return;
        }

        const statusCode = urlMatch[1];

        switch (req.method) 
        {
            case 'GET':
                await handleGet(req, res, statusCode);
                break;
            case 'PUT':
                await handlePut(req, res, statusCode);
                break;
            case 'DELETE':
                await handleDelete(req, res, statusCode);
                break;
            default:
                console.log(`[INVALID] ${req.method} ${req.url} (Метод не дозволено)`);
                res.writeHead(405, { 'Content-Type': 'text/plain' });
                res.end('Method Not Allowed');
                break;
        }
    });

    server.listen(port, host, () => {
    });
}

startServer();