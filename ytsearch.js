const yts = require("yt-search");
const ytsa = require("youtube-search-api");


function factoryOptions(opts, defaultOpts) {
    for (const k in defaultOpts) {
        const defaultOpt = defaultOpts[k];

        if (!opts.hasOwnProperty(k)) {
            opts[k] = defaultOpt;
        } else if (typeof opts[k] !== typeof defaultOpt) {
            throw TypeError(k + " must be a " + typeof defaultOpt + " received \"" + typeof opts[k] + "\"");
        }
        if (typeof defaultOpt === typeof 1 && opts[k] < 0) {
            throw TypeError(k + " must be positive integer received \"" + opts[k] + "\"");
        }
    }

    return opts;
}

async function getVideoInfo(videoId) {
    return await yts({ videoId })
        .catch(e => e);
}

class YTSearch {
    constructor(opts = {}) {
        const defaultOpts = {
            countPages: 1,
            countItems: 1,
            withPlayList: false,
            limit: 1,
            options: {}
        };

        opts = factoryOptions(opts, defaultOpts);

        if (!opts.hasOwnProperty("query")) {
            throw Error("Undefined or missing query");
        }
        if (typeof opts.query !== "string") {
            throw TypeError("query must be a string received \"" + typeof opts.query + "\"");
        }

        async function loadPages() {
            const pages = [];
            let nextPage;
            const query = opts.query;
            const withPlayList = opts.withPlayList;
            const maxItems = opts.countItems;
            const maxPages = opts.countPages;

            for (let i = 0; i < maxPages; i++) {
                if (!maxItems) {
                    pages.push([]);
                    break;
                }

                const page = await (!nextPage ? ytsa.GetListByKeyword(query, withPlayList, maxItems, opts.options) : ytsa.NextPage(nextPage, withPlayList, maxItems, opts.options));

                if (page.nextPage) {
                    nextPage = page.nextPage;
                }
                if (page.items) {
                    pages.push(page.items);
                }
            }

            const pagesFactory = pages.length ? (pages.map(videos => videos.length && (videos.map(video => video && getVideoInfo(video.id))))) : [];

            return pagesFactory;
        }

        this.result = loadPages();
    }
    factoryMap(videos = [], type) {
        return videos.map(v => v[type]);
    }
    factoryFind(videos = [], type = '', val) {
        return videos.find(v => v[type] === val);
    }
    findMax(arr = []) {
        return Math.max.apply(this, arr);
    }
    findMin(arr = []) {
        return Math.min.apply(this, arr);
    }
    async getResult() {
        return await this.result;
    }
    async getVideoList(opts = {}) {
        const defaultOpts = {
            page: 1
        };
        
        opts = factoryOptions(opts, defaultOpts);
        
        if (!opts.page) {
            throw Error('Get 0 page results');
        }
        
        const pages = await this.getResult();

        if (opts.page > pages.length) {
            throw Error("Page " + opts.page + " not available (" + opts.page + "/" + pages.length + ")");
        }

        const videos = opts.page === 0 ? [] : pages[opts.page - 1];
        
        if (!videos.length) {
            throw Error('Get 0 video results');
        }

        return videos;
    }
    async getAudioList() {
        // not available yet
        return (await this.result).audios;
    }
    async getFirstVideo(page = 1) {
        const videos = await this.getVideoList({ page });
        const video = videos[0];

        return video;
    }
    async getLastVideo(page = 1) {
        const videos = await this.getVideoList({ page });
        const video = videos[videos.length - 1];

        return video;
    }
    async getVideoByMostViews(page = 1) {
        const videos = await this.getVideoList({ page });
        const viewsList = this.factoryMap(videos, 'views');
        const mostViews = this.findMax(viewsList);
        const video = this.factoryFind(videos, 'views', mostViews);

        return video;
    }
    async getVideoByLeastViews(page = 1) {
        const videos = await this.getVideoList({ page });
        const viewsList = this.factoryMap(videos, 'views');
        const leastViews = this.findMin(viewsList);
        const video = this.factoryFind(videos, 'views', leastViews);

        return video;
    }
    async getVideoByLongestDuration(page = 1) {
        const videos = await this.getVideoList({ page });
        const timestampList = this.factoryMap(videos, 'seconds');
        const longerDuration = this.findMax(timestampList);
        const video = this.factoryFind(videos, 'seconds', longerDuration);

        return video;
    }
    async getVideoByShortestDuration(page = 1) {
        const videos = await this.getVideoList({ page });
        const timestampList = this.factoryMap(videos, 'seconds');
        const shorterDuration = this.findMin(timestampList);
        const video = this.factoryFind(videos, 'seconds', shorterDuration);

        return video;
    }
    async getRandomVideo(page = 1) {
        const videos = await this.getVideoList({ page });
        const randIndex = Math.floor(Math.random() * videos.length);
        const video = videos[randIndex];

        return video;
    }
    async pickVideo(page, index) {
        const tempPage = page;

        if (!arguments.hasOwnProperty(1)) {
            page = 1;
            index = tempPage;
        }

        const videos = await this.getVideoList({ page });

        if (typeof index !== 'number' || index > videos.length || index < 0) {
            throw Error('Index must be a number between 0-' + videos.length);
        }

        const video = videos[index];

        return video;
    }
    async getVideoBy(page, category = '') {
        const tempPage = page;

        if (!arguments.hasOwnProperty(1)) {
            page = 1;
            category = tempPage || "";
        }

        const categories = ['first', 'last', 'most', 'least', 'longest', 'shortest', 'random']
        let video = {};

        switch (category) {
            case categories[0]:
                video = this.getFirstVideo;
                break;
            case categories[1]:
                video = this.getLastVideo;
                break;
            case categories[2]:
                video = this.getVideoByMostViews;
                break;
            case categories[3]:
                video = this.getVideoByLeastViews;
                break;
            case categories[4]:
                video = this.getVideoByLongestDuration;
                break;
            case categories[5]:
                video = this.getVideoByShortestDuration;
                break
            case categories[6]:
                video = this.getRandomVideo;
                break;
            default:
                throw Error('Categories must be value between ' + categories.join('|'));
                break;
        }

        return await video.bind(this)(page);
    }
    static search = yts
}

module.exports = YTSearch;
