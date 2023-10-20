const config = require("./config.json");
const analyzeK = Symbol("analyze.url.key");
const convertK = Symbol("convert.url.key");
const YTSearch = require("./ytsearch");
const { default: axios } = require("axios");


function hasOwnProperty() {
    return {}.hasOwnProperty.apply(this, arguments);
}
function sameAsType(a, b, c) {
    const type = typeof a === typeof b;

    if (!type) {
        throw TypeError(`${c} must be type ${typeof b} given "${typeof a}"`);
    }
    if (!a) {
        throw TypeError(`${c} must not be "${a}"`);
    }

    return type && typeof a;
}


class Y2Matez {
    constructor(opts = {}) {
        // initialize query, url
        this.query = null;
        this.url = null;

        if (hasOwnProperty.call(opts, "query")) {
            this.useQuery(opts.query);
        }
        if (hasOwnProperty.call(opts, "url")) {
            this.useUrl(opts.url);
        }

        this[analyzeK] = config.y2mate.url.analyzeV2;
        this[convertK] = config.y2mate.url.convertV2;
    }
    useQuery(query) {
        if (!hasOwnProperty.call(arguments, 0)) {
            throw ReferenceError("Undefined or missing query");
        }
        
        sameAsType(query, "", "query");

        // set query
        this.query = query;
        this.nourl = true;

        return this;
    }
    useUrl(url) {
        if (!hasOwnProperty.call(arguments, 0)) {
            throw ReferenceError("Undefined or missing url");
        }

        sameAsType(url, "", "url");

        // set url
        this.url = this.parseYoutubeId(url, 1).url;
        this.nourl = false;

        return this;
    }
    parseYoutubeId(url, strict) {
        const yturlRegex = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:shorts\/)?(?:watch\?.*(?:|\&)v=|embed\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/;
        const [, videoId] = (url || "").match(yturlRegex) || [];

        if (!videoId && strict) {
            throw Error(`Invalid youtube url: ${url}`);
        }

        return {
            url,
            videoId
        };
    }
    checkResponse(response, loc) {
        const pageError = response instanceof Error;

        if (pageError) {
            throw Error("Server response " + response.status + ", caused by mismatch payload request or by internal server itself (" + (loc || "") + ")");
        }
        if (!response.data) {
            throw Error("Empty response from server (" + (loc || "") + ")");
        }
        if (response.data?.status !== "ok") {
            throw Error("Something went error please try again (" + (loc || "") + ")");
        }
    }
    checkRequired() {
        if ([this.query, this.url].every(opt => opt === null)) {
            throw Error("Missing query or url");
        }
    }
    async getVideoDetail(videoId) {
        const detail = this.query && this.nourl ? await (new YTSearch({ query: this.query }).getFirstVideo()) : await YTSearch.search({ videoId }).catch(e => typeof e === typeof "" ? Error(e) : e);
    }
    async analyze(text) {
        if (hasOwnProperty.call(arguments, 0)) {
            const { url: textVideoUrl, videoId: textVideoId } = this.parseYoutubeId(text);

            // set text as query or url
            textVideoId ? this.useUrl(textVideoUrl) : this.useQuery(text);
        }

        this.checkRequired();

        const videoId = !this.query && this.parseYoutubeId(this.url).videoId;
        const videoDetail = this.query ? await (new YTSearch({ query: this.query }).getFirstVideo()) : await YTSearch.search({ videoId }).catch(e => typeof e === typeof "" ? Error(e) : e);

        if (videoDetail instanceof Error) {
            throw videoDetail;
        }

        const videoUrl = videoDetail.url;
        const page = await axios({
            url: this[analyzeK],
            method: "POST",
            data: {
                k_query: videoUrl,
                k_page: "home",
                hl: "id",
                q_auto: 1
            },
            headers: config.headers
        }).catch(e => e);
        const analyzeInfo = page?.data;
        
        this.checkResponse(page, "payload{v1}");

        return {
            links: analyzeInfo.links,
            related: analyzeInfo.related,
            detail: videoDetail
        };
    }
    async convert(analyzeInfo) {
        if (!hasOwnProperty.call(analyzeInfo, "videoId")) {
            throw Error("Missing videoId");
        }
        if (!hasOwnProperty.call(analyzeInfo, "token")) {
            throw Error("Missing token");
        }

        const videoId = analyzeInfo?.videoId;
        const token = analyzeInfo?.token;
        
        sameAsType(videoId, "", "videoId");
        sameAsType(token, "", "token");

        const page = await axios({
            url: this[convertK],
            method: "POST",
            data: {
                vid: videoId,
                k: token
            },
            headers: config.headers
        }).catch(e => e);
        const convertInfo = page?.data;

        this.checkResponse(page, "payload{v2}");

        return convertInfo;
    }
    async getInfo(ftype, fquality) {
        if (!hasOwnProperty.call(arguments, 0)) {
            throw Error("format type is required ex. mp4, mp3");
        }
        if (!fquality) {
            fquality = "auto";
            // throw Error("quality is required ex. 720p, 128kbps");
        }

        const analyzeInfo = await this.analyze();
        const links = analyzeInfo && analyzeInfo.links;
        const formatsAvailable = Object.keys(links || {});
        const autoQuality = fquality === "auto" && (ftype === "mp4" ? "360p" : ftype === "mp3" ? "128kbps" : fquality);

        if (!formatsAvailable.length || !formatsAvailable.includes(ftype)) {
            throw Error(`format type "${ftype}" not available`);
        }

        const selectMedia = links[ftype];
        const qualitiesAvailable = Object.values(selectMedia || {}).map(v => v?.q);
        const selectQuality = autoQuality || fquality;
        
        if (!qualitiesAvailable.length || !qualitiesAvailable.includes(selectQuality)) {
            throw Error(`${(autoQuality && "auto ") || ""}quality "${selectQuality}" not available`);
        }
        
        const videoId = analyzeInfo.detail.videoId;
        const { k: token, q_text, q, size } = Object.values(selectMedia).find(v => v?.q === selectQuality);
        const convertInfo = await this.convert({ videoId, token });

        return {
            analyzeInfo,
            convertInfo: {
                ftype: convertInfo.ftype,
                fquality: convertInfo.fquality,
                dlink: convertInfo.dlink,
                q,
                q_text,
                size
            }
        };
    }
}

module.exports = Y2Matez
