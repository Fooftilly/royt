/// <reference path="index.ts" />
/**
    * Namespace for All AlienTube operations.
    * @namespace AlienTube
*/
module AlienTube {
    /**
        Application class for AlienTube
        @class Application
    */
    "use strict";
    export class Application {
        static localisationManager: LocalisationManager;
        static commentSection: CommentSection;
        currentVideoIdentifier: string;

        constructor() {
            // Load preferences from disk.
            Preferences.initialise(function () {
                // Check if a version migration is necessary.
                if (Preferences.getString("lastRunVersion") !== Application.version()) {
                    new Migration(Preferences.getString("lastRunVersion"));
                    
                    /* Update the last run version paramater with the current version so we'll know not to run this migration again. */
                    Preferences.set("lastRunVersion", Application.version());
                }
            });
            
            // Load language files. 
            Application.localisationManager = new LocalisationManager(function () {
                // Load stylesheet
                if (Application.getCurrentBrowser() === Browser.SAFARI) {
                    new HttpRequest(Application.getExtensionRessourcePath("style.css"), RequestType.GET, function (data) {
                        var stylesheet = document.createElement("style");
                        stylesheet.setAttribute("type", "text/css");
                        stylesheet.textContent = data;
                        document.head.appendChild(stylesheet);
                    });
                }

                // Start observer to detect when a new video is loaded.
                let observer = new MutationObserver(this.mutationObserver);
                let config = { attributes: true, childList: true, characterData: true };
                observer.observe(document.getElementById("content"), config);

                // Start a new comment section.
                this.currentVideoIdentifier = Application.getCurrentVideoId();
                if (Utilities.isYouTubeVideoPage) {
                    Application.commentSection = new CommentSection(this.currentVideoIdentifier);
                }
            }.bind(this));

        }

        /**
            * Mutation Observer for monitoring for whenver the user changes to a new "page"
            * @param mutations A collection of mutation records
            * @private
        */
        private mutationObserver(mutations: Array<MutationRecord>) {
            mutations.forEach(function (mutation) {
                let target = <HTMLElement>mutation.target;
                if (target.classList.contains("yt-card") ||  target.id === "content") {
                    let reportedVideoId = Application.getCurrentVideoId();
                    if (reportedVideoId !== this.currentVideoIdentifier) {
                        this.currentVideoIdentifier = reportedVideoId;
                        if (Utilities.isYouTubeVideoPage) {
                            Application.commentSection = new CommentSection(this.currentVideoIdentifier);
                        }
                    }
                }
            });
        }

        /**
        * Get the current YouTube video identifier of the window.
        * @returns YouTube video identifier.
        */
        public static getCurrentVideoId(): string {
            if (window.location.search.length > 0) {
                let s = window.location.search.substring(1);
                let requestObjects = s.split('&');
                for (let i = 0, len = requestObjects.length; i < len; i += 1) {
                    let obj = requestObjects[i].split('=');
                    if (obj[0] === "v") {
                        return obj[1];
                    }
                }
            }
            return null;
        }

        /**
        * Get a Reddit-style "x time ago" Timestamp from a unix epoch time.
        * @param epochTime Epoch timestamp to calculate from.
        * @returns A string with a human readable time.
        */
        public static getHumanReadableTimestamp(epochTime: number): string {
            let secs = Math.floor(((new Date()).getTime() / 1000) - epochTime);
            secs = Math.abs(secs);

            let timeUnits = {
                Year:   Math.floor(secs / 60 / 60 / 24 / 365.27),
                Month:  Math.floor(secs / 60 / 60 / 24 / 30),
                Day:    Math.floor(secs / 60 / 60 / 24),
                Hour:   Math.floor(secs / 60 / 60),
                Minute: Math.floor(secs / 60),
                Second: secs,
            };

            /* Retrieve the most relevant number by retrieving the first one that is "1" or more.
            Decide if it is plural and retrieve the correct localisation */
            for (let timeUnit in timeUnits) {
                if (timeUnits.hasOwnProperty(timeUnit) && timeUnits[timeUnit] >= 1) {
                    if (timeUnits[timeUnit] > 1) {
                        return Application.localisationManager.get("timestamp_format", [
                            timeUnits[timeUnit],
                            Application.localisationManager.get(`timestamp_format_${ timeUnit.toLowerCase() }_plural`)
                        ]);
                    } else {
                        return Application.localisationManager.get("timestamp_format", [
                            timeUnits[timeUnit],
                            Application.localisationManager.get("timestamp_format_" + timeUnit.toLowerCase())
                        ]);
                    }
                }
            }
            return Application.localisationManager.get("timestamp_format", [
                "0",
                Application.localisationManager.get("timestamp_format_second_plural")
            ]);
        }

        /**
        * Get the path to a ressource in the AlienTube folder.
        * @param path Filename to the ressource.
        * @returns Ressource path (file://)
        */
        public static getExtensionRessourcePath(path: string): string {
            switch (Application.getCurrentBrowser()) {
                case Browser.SAFARI:
                    return safari.extension.baseURI + 'res/' + path;
                case Browser.CHROME:
                    return chrome.extension.getURL('res/' + path);
                case Browser.FIREFOX:
                    return self.options.ressources[path];
                default:
                    return null;
            }
        }

        /**
            * Get the HTML templates for the extension
            * @param callback A callback to be called when the extension templates has been loaded.
        */
        public static getExtensionTemplates(callback: any) {
            switch (Application.getCurrentBrowser()) {
                case Browser.FIREFOX:
                    let template = document.createElement("div");
                    let handlebarHTML = Handlebars.compile(self.options.template);
                    template.innerHTML = handlebarHTML();

                    if (callback) {
                        callback(template);
                    }
                    break;

                case Browser.SAFARI:
                    new HttpRequest(Application.getExtensionRessourcePath("templates.html"), RequestType.GET, function (data) {
                        let template = document.createElement("div");
                        let handlebarHTML = Handlebars.compile(data);
                        template.innerHTML = handlebarHTML();
    
                        if (callback) {
                            callback(template);
                        }
                    }.bind(this), null, null);
                    break;

                case Browser.CHROME:
                    let templateLink = document.createElement("link");
                    templateLink.id = "alientubeTemplate";
                    templateLink.onload = function () {
                        if (callback) {
                            callback(templateLink.import);
                        }
                    }.bind(this);
                    templateLink.setAttribute("rel", "import");
                    templateLink.setAttribute("href", Application.getExtensionRessourcePath("templates.html"));
                    document.head.appendChild(templateLink);
                    break;
            }
        }
        
        /**
         * Get the current version of the extension.
         * @public
         */
        public static version(): string {
            let version = "";
            switch (Application.getCurrentBrowser()) {
                case Browser.CHROME:
                    version = chrome.runtime.getManifest()["version"];
                    break;

                case Browser.FIREFOX:
                    version = self.options.version;
                    break;
                    
                case Browser.SAFARI:
                    version = safari.extension.displayVersion;
                    break;
            }
            return version;
        }
        
        /**
         * Get an element from the template collection.
         * @param templateCollection The template collection to use.
         * @param id The id of the element you want to retreive.
         */
        public static getExtensionTemplateItem(templateCollection: any, id: string) {
            switch (Application.getCurrentBrowser()) {
                case Browser.CHROME:
                    return templateCollection.getElementById(id).content.cloneNode(true);
                    
                case Browser.FIREFOX:
                    return templateCollection.querySelector("#" + id).content.cloneNode(true);
                    
                case Browser.SAFARI:
                    return templateCollection.querySelector("#" + id).content.cloneNode(true);
            }
        }
        
        static getCurrentBrowser() {
            if (typeof (chrome) !== 'undefined') return Browser.CHROME;
            else if (typeof (self.on) !== 'undefined') return Browser.FIREFOX;
            else if (typeof (safari) !== 'undefined') return Browser.SAFARI;
            else {
                throw "Invalid Browser";
            }
        }
    }
}
