import { LitElement, html, css } from "lit-element"
import packageInfo from "../package.json"


class NavigationCard extends LitElement {
    // The height of your card. Home Assistant uses this to automatically
    // distribute all cards over the available columns.
    getCardSize() {
        return 1
    }

    // This will make parts of the card rerender when this.hass or this._config is changed.
    // this.hass is updated by Home Assistant whenever anything happens in your system
    static get properties() {
        return {
            hass: { attribute: false },
            _config: { state: true },
            _templateResults: { state: true },
            _unsubRenderTemplates: { state: true },
        }
    }

    // Our initial states
    constructor() {
        super()
        this._templateResults = {}
        this._unsubRenderTemplates = new Map()
    }

    // Called by HAAS when config is changed
    setConfig(config) {
        this._tryDisconnect()

        if (!config.icon) {
            throw new Error("You need to define an Icon for the room")
        }

        this._config = {
            items: [],
            ...config
        }
    }

    // Called by HAAS
    updated(changedProps) {
        super.updated(changedProps)
        if (!this._config || !this.hass) {
            return
        }
        
        // Workaround for now
        if (this.parentElement) {
            this.parentElement.style.position = "sticky"
            this.parentElement.style.bottom = "26px"
        }
    }

    // Called by HAAS
    connectedCallback() {
        super.connectedCallback()
    }

    // Called by HAAS
    disconnectedCallback() {
        this._tryDisconnect()
    }

    // Register our custom editor
    //static getConfigElement() {
    //    return document.createElement("navigation-card-editor");
    //}

    // The render() function of a LitElement returns the HTML of your card, and any time one or the
    // properties defined above are updated, the correct parts of the rendered html are magically
    // replaced with the new values.  Check https://lit.dev for more info.
    render() {
        return html`
            <ha-card>
                <div class="flex-box">
                    ${this._config.items.map((item) => {
                        return this._getItemHTML(item)
                    })}
                </div>
            </ha-card>
        `
    }

    // Get the navigation icon
    _getItemHTML(item) {
        const defaultActiveTemplate = `{% if url == "${item.on_tap?.navigation_path}" %}true{% endif %}`
        const activeTemplateResult = this._getValue(item.active ?? defaultActiveTemplate, item)
        const isActive = activeTemplateResult != undefined && activeTemplateResult != "" && activeTemplateResult != "false"

        //console.log("######", "Action =", activeTemplateResult)
        //console.log("Template =", defaultActiveTemplate)
        //console.log("IsActive =", isActive)

        return html`<ha-icon
                        @click=${() => this._handleAction(item)}
                        .icon=${item.icon}
                        class="${isActive ? 'active' : ''}"
                        style="--icon-color: ${item.color ?? 'var(--main-color)'};--icon-color-active: ${item.color_active ?? 'var(--main-active)'};"/>`
    }

    // Check if an item is a template
    _isTemplate(template) {
        return template?.includes("{")
    }

    // Get the value, by checking if it's a template, otherwise assume it's
    // an entity and get it's state
    _getValue(template) {
        if (this._isTemplate(template)) {
            this._tryConnect(template)
        }

        return this._isTemplate(template)
            ? this._templateResults[template]?.result?.toString()
            : ""
    }

    // Handle navigation on click
    _handleAction(item) {
        if (!item.on_tap) return

        this._fireEvent(this, "hass-action", {
            config: {
                tap_action: item.on_tap
            },
            action: "tap"
        })

        this.forwardHaptic("light")
    }

    // Disconnect all template subscriptions
    async _tryDisconnect() {
        for (const template in this._templateResults) {
            this._tryDisconnectKey(template)
        }
    }

    async _tryDisconnectKey(template) {
        const unsubRenderTemplate = this._unsubRenderTemplates.get(template)
        if (!unsubRenderTemplate) {
            return
        }

        try {
            const unsub = await unsubRenderTemplate
            unsub()
            this._unsubRenderTemplates.delete(template)
        } catch (err) {
            if (err.code === "not_found" || err.code === "template_error") {
                // If we get here, the connection was probably already closed. Ignore.
            } else {
                throw err
            }
        }
    }

    // Try and subscribe to a template
    async _tryConnect(template) {   
        if (
            this._unsubRenderTemplates.get(template) !== undefined ||
            !this.hass ||
            !this._config ||
            !this._isTemplate(template)) {
            return
        }

        try {
            const sub = this._subscribeRenderTemplate(
                this.hass.connection,
                (result) => {
                    this._templateResults = {
                        ...this._templateResults,
                        [template]: result,
                    }
                },
                {
                    template: template ?? "",
                    variables: {
                        config: this._config,
                        user: this.hass.user?.name,
                        hash: window.location.hash,
                        url: window.location.pathname,
                    },
                    strict: true,
                }
            )

            this._unsubRenderTemplates.set(template, sub)
            await sub
        } catch(err) {
            this._unsubRenderTemplates.delete(template)
        }
    }

    async _subscribeRenderTemplate(conn, onChange, params) {
        return conn.subscribeMessage((msg) => onChange(msg), {
            type: "render_template",
            ...params,
        })
    }

    forwardHaptic(hapticType) {
        this._fireEvent(this, "haptic", hapticType);
    }

    // Send a dom event
    _fireEvent(node, type, detail, options) {
        options = options || {}
        detail = detail === null || detail === undefined ? {} : detail
        const event = new Event(type, {
            bubbles: options.bubbles === undefined ? true : options.bubbles,
            cancelable: Boolean(options.cancelable),
            composed: options.composed === undefined ? true : options.composed,
        })
        event.detail = detail
        node.dispatchEvent(event)
        return event
    }

    static get styles() {
        return css`
            :host {
                --side-margin: 20px;
                --icon-size: 28px;
                --main-color: #FFFFFF;
                --main-active: #44739ee6;
                --mdc-icon-size: var(--icon-size);
            }

            :host:before {
                content: '';
                display: block;
                position: absolute;
                bottom: -26px;
                left: -8px;
                padding-right: 16px;
                height: 120px;
                width: 100%; 
                background: linear-gradient(180deg, rgba(45, 56, 76, 0) 0%, rgba(35, 46, 66, 0.85) 50%);
                pointer-events: none;
                animation: 0.6s opacity ease-in-out;
            }

            ha-icon {
                color: var(--icon-color);
                padding: 10px;
                cursor: pointer;
            }

            ha-icon.active {
                color: var(--icon-color-active);
            }

            ha-card {
                animation: 0.6s position ease-in-out;
                margin-left: var(--side-margin) !important;
                margin-right: var(--side-margin) !important;
                margin-top: 30px;
            }

            .flex-box {
                display: flex;
                justify-content: space-evenly;
                align-items: center;
                margin-top: 20px;
            }

            @keyframes position {
                0% { bottom: -80px; }
                20% { bottom: -80px; }
                70% { bottom: 2px; }
                90% { bottom: 0px; }
                100% { bottom: 2px; }
            }

            @keyframes opacity {
                0% { opacity: 0; }
                20% { opacity: 0; }
                100% { opacity: 1; }
            }
        `;
    }
}

customElements.define("navigation-card", NavigationCard);

console.log(
    `%c NavigationCard %c ${packageInfo.version}`,
    "color: white; background: #039be5; font-weight: 700;",
    "color: #039be5; background: white; font-weight: 700;"
);