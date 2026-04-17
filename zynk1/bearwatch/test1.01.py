import os
import re
import functools
import datetime
import yfinance as yf
import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from dash import Dash, dcc, html, Input, Output
import plotly.graph_objs as go
from urllib.parse import parse_qs, urlencode
from RelatedStocks import get_related_stocks
from StockOverview import get_stock_overview
from AboutStock import get_stock_about
from TrendingStocks import get_trending_stocks
from database import init_db, get_db
from auth_zk import verify_zk_proof

server = Flask(__name__)
server.secret_key = os.environ.get('BEARWATCH_SECRET', os.urandom(24))

with server.app_context():
    init_db()

home_tickers = {
    "S&P 500": "^GSPC",
    "NASDAQ": "^IXIC",
    "Dow Jones": "^DJI"
}

# ─── Helpers ────────────────────────────────────────────────────────────────

def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def get_current_user():
    if 'user_id' not in session:
        return None
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    db.close()
    return dict(user) if user else None

def fetch_stock_data(ticker, pd="1d"):
    intervalsForPeriod = {"1d":"1m","5d":"1h","1mo":"1h","3mo":"1d","ytd":"1d","1y":"1d","max":"1d"}
    stock = yf.Ticker(ticker)
    df = stock.history(period=pd, interval=intervalsForPeriod[pd])
    return df

def determine_color(stock_symbol, colorblind_mode=False):
    stock = yf.Ticker(stock_symbol)
    data = fetch_stock_data(stock_symbol)
    current_price = stock.info.get("currentPrice", data["Close"].iloc[-1])
    prev_close = stock.info.get("previousClose", data["Close"].iloc[0])
    price_change = current_price - prev_close
    percent_change = (price_change / prev_close) * 100
    if colorblind_mode:
        line_color = "blue" if price_change > 0 else "orange"
    else:
        line_color = "green" if price_change > 0 else "red"
    sign = "+" if price_change > 0 else ""
    title = f"""
    {stock.info.get('shortName', stock_symbol)} <br>
    ${current_price:.2f} <span style='color:{line_color};'> <br>
    {sign}${price_change:.2f} ({sign}{percent_change:.2f}%) Today</span>
    """
    return line_color, title

# ─── News ───────────────────────────────────────────────────────────────────

def get_news(query="Stock Market", count=8, offset=0):
    try:
        result = yf.Search(query, news_count=(count + offset))
        if not result or not result.news:
            return []
        articles = []
        for a in result.news[offset:offset + count]:
            ts = a.get("providerPublishTime", 0)
            date_str = datetime.datetime.fromtimestamp(ts).strftime("%-m/%-d/%Y") if ts else ""
            tickers = a.get("relatedTickers", [])
            base = {
                "title": a.get("title", "No Title"),
                "link": a.get("link", "#"),
                "image": a.get("thumbnail", {}).get("resolutions", [{}])[0].get("url", ""),
                "publisher": a.get("publisher", ""),
                "date": date_str,
                "tickers": ",".join(tickers[:6]) if tickers else "",
            }
            base["article_url"] = _build_article_url(base)
            articles.append(base)
        return articles
    except Exception as e:
        print(f"Error fetching news: {e}")
        return []

def get_stock_news(stock_symbol, count=5):
    try:
        result = yf.Search(stock_symbol, news_count=count)
        if not result or not result.news:
            return []
        return [{"title": a.get("title", "No Title"), "link": a.get("link", "#"),
                 "image": a.get("thumbnail", {}).get("resolutions", [{}])[0].get("url", "https://via.placeholder.com/70")}
                for a in result.news[:count]]
    except Exception as e:
        print(f"Stock News Error: {e}")
        return []

def get_main_news(query="Stock Market", count=8):
    try:
        result = yf.Search(query, news_count=count)
        if not result or not result.news:
            return []
        articles = []
        for a in result.news[:count]:
            ts = a.get("providerPublishTime", 0)
            date_str = datetime.datetime.fromtimestamp(ts).strftime("%-m/%-d/%Y") if ts else ""
            tickers = a.get("relatedTickers", [])
            articles.append({
                "title": a.get("title", "No Title"),
                "link": a.get("link", "#"),
                "image": a.get("thumbnail", {}).get("resolutions", [{}])[0].get("url", ""),
                "publisher": a.get("publisher", ""),
                "date": date_str,
                "tickers": ",".join(tickers[:6]) if tickers else "",
            })
        return articles
    except Exception as e:
        print(f"News Error: {e}")
        return []

def get_latest_financial_news(count=5):
    try:
        result = yf.Search("Financial Market", news_count=count)
        if not result or not result.news:
            return []
        return [{"title": a.get("title", "No Title"), "link": a.get("link", "#")}
                for a in result.news[:count]]
    except Exception as e:
        print(f"Ticker News Error: {e}")
        return []

# ─── Dash: Home Tabs ────────────────────────────────────────────────────────

appHome = Dash(__name__, server=server, routes_pathname_prefix="/home/")
appHome.layout = html.Div([
    dcc.Location(id="url", refresh=False),
    html.Div(id="tabs-container"),
    html.Div(id="tabs-content")
])

@appHome.callback(Output("tabs-container", "children"), Input("url", "search"))
def update_tabs(search):
    dark_mode = False
    if search:
        query = parse_qs(search.lstrip("?"))
        dark_mode = query.get("darkmode", ["false"])[0] == "true"
    tab_bg = "#222325" if dark_mode else "#f0ede7"
    tab_text = "#dee4fc" if dark_mode else "#311f6b"
    tab_sel_bg = "#dee4fc" if dark_mode else "#311f6b"
    tab_sel_text = "#141417" if dark_mode else "#f0ede7"
    border = "#191a1b" if dark_mode else "#f0ede9"
    style = {"backgroundColor": tab_bg, "color": tab_text, "border": f"1px solid {border}",
             "fontFamily": "Cambria, Georgia, serif", "padding": "10px",
             "textAlign": "center", "justifyContent": "center", "alignItems": "center", "display": "flex"}
    sel_style = {**style, "backgroundColor": tab_sel_bg, "color": tab_sel_text}
    return dcc.Tabs(id="tabs", value="S&P 500",
                    children=[dcc.Tab(label=n, value=n, style=style, selected_style=sel_style)
                              for n in home_tickers],
                    style={"backgroundColor": tab_bg, "borderBottom": f"2px solid {border}",
                           "fontFamily": "Cambria, Georgia, serif"})

@appHome.callback(Output("tabs-content", "children"), Input("tabs", "value"), Input("url", "search"))
def update_home_graph(selected_tab, search):
    colorblind_mode = False
    dark_mode = False
    time_range = "1d"
    if search:
        query = parse_qs(search.lstrip("?"))
        time_range = query.get("time", ["1d"])[0]
        colorblind_mode = query.get("colorblind", ["false"])[0] == "true"
        dark_mode = query.get("darkmode", ["false"])[0] == "true"
    df = fetch_stock_data(home_tickers[selected_tab], time_range)
    line_color, title = determine_color(home_tickers[selected_tab], colorblind_mode)
    bg = "#141417" if dark_mode else "#F9F5ED"
    text = "#dee4fc" if dark_mode else "#311f6b"
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df.index, y=df["Close"], mode="lines",
                             line=dict(color=line_color, width=2), name=selected_tab))
    fig.update_layout(plot_bgcolor=bg, paper_bgcolor=bg, font=dict(color=text),
                      title=title, title_x=0.5, xaxis_title="Time", yaxis_title="Closing Price",
                      xaxis=dict(showgrid=True), yaxis=dict(showgrid=True))
    return dcc.Graph(figure=fig)

# ─── Dash: Stock Chart ───────────────────────────────────────────────────────

app = Dash(__name__, server=server, routes_pathname_prefix="/dashboard/")
app.layout = html.Div([
    dcc.Location(id="url", refresh=False),
    dcc.Graph(id="live-stock-graph"),
    dcc.Interval(id="interval-component", interval=1000, n_intervals=0),
])

@app.callback(Output("live-stock-graph", "figure"),
              [Input("interval-component", "n_intervals"), Input("url", "search")])
def update_stock_graph(n, search):
    stock_symbol = "^GSPC"
    time_range = "1d"
    colorblind_mode = False
    dark_mode = False
    if search:
        query = parse_qs(search.lstrip("?"))
        stock_symbol = query.get("stock", ["^GSPC"])[0]
        time_range = query.get("time", ["1d"])[0]
        colorblind_mode = query.get("colorblind", ["false"])[0] == "true"
        dark_mode = query.get("darkmode", ["false"])[0] == "true"
    data = fetch_stock_data(stock_symbol, time_range)
    stock = yf.Ticker(stock_symbol)
    stock_info = stock.info
    if data.empty or "currentPrice" not in stock_info:
        return go.Figure()
    current_price = stock_info.get("currentPrice", data["Close"].iloc[-1])
    prev_close = stock_info.get("previousClose", data["Close"].iloc[0])
    price_change = current_price - prev_close
    percent_change = (price_change / prev_close) * 100
    if colorblind_mode:
        line_color = "blue" if price_change > 0 else "orange"
    else:
        line_color = "green" if price_change > 0 else "red"
    sign = "+" if price_change > 0 else ""
    title = f"""
    {stock_info.get('shortName', stock_symbol)} <br>
    ${current_price:.2f} <span style='color:{line_color};'> <br>
    {sign}${price_change:.2f} ({sign}{percent_change:.2f}%) Today</span>
    """
    bg = "#141417" if dark_mode else "#F9F5ED"
    text = "#dee4fc" if dark_mode else "#311f6b"
    figure = go.Figure(data=[go.Scatter(x=data.index, y=data["Close"], mode="lines",
                                        line=dict(color=line_color, width=2), name=stock_symbol)])
    figure.update_layout(plot_bgcolor=bg, paper_bgcolor=bg, font=dict(color=text),
                         title=title, title_x=0.5, xaxis_title="Time", yaxis_title="Price",
                         xaxis=dict(showgrid=True), yaxis=dict(showgrid=True))
    return figure

# ─── Auth Routes ─────────────────────────────────────────────────────────────

@server.route('/login', methods=['GET'])
def login():
    if 'user_id' in session:
        return redirect(url_for('home'))
    return render_template('login.html')

@server.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    pub_key = (data.get('pub_key') or '').strip()
    proof = data.get('proof') or {}
    name = (data.get('name') or '').strip()

    if not email or not pub_key or not proof.get('r') or not proof.get('s'):
        return jsonify({'error': 'Missing required fields'}), 400

    if not verify_zk_proof(pub_key, proof['r'], proof['s']):
        return jsonify({'error': 'Invalid cryptographic proof'}), 401

    db = get_db()
    existing = db.execute('SELECT id FROM users WHERE email = ? OR pub_key = ?',
                          (email, pub_key)).fetchone()
    if existing:
        db.close()
        return jsonify({'error': 'Account already exists. Please log in.'}), 409

    db.execute('INSERT INTO users (email, pub_key, name, balance) VALUES (?, ?, ?, 10000.00)',
               (email, pub_key, name or email.split('@')[0]))
    db.commit()
    user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    db.close()

    session['user_id'] = user['id']
    session['user_email'] = user['email']
    return jsonify({'success': True, 'user': {'email': user['email'], 'name': user['name'],
                                               'balance': user['balance']}})

@server.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}
    pub_key = (data.get('pub_key') or '').strip()
    proof = data.get('proof') or {}

    if not pub_key or not proof.get('r') or not proof.get('s'):
        return jsonify({'error': 'Missing credentials'}), 400

    if not verify_zk_proof(pub_key, proof['r'], proof['s']):
        return jsonify({'error': 'Invalid cryptographic proof'}), 401

    db = get_db()
    user = db.execute('SELECT * FROM users WHERE pub_key = ?', (pub_key,)).fetchone()
    db.close()

    if not user:
        return jsonify({'error': 'No account found. Please register first.'}), 404

    session['user_id'] = user['id']
    session['user_email'] = user['email']
    return jsonify({'success': True, 'user': {'email': user['email'], 'name': user['name'],
                                               'balance': user['balance']}})

@server.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

# ─── Portfolio Routes ─────────────────────────────────────────────────────────

@server.route('/portfolio')
@login_required
def portfolio():
    current_user = get_current_user()
    db = get_db()
    holdings_raw = db.execute('SELECT * FROM portfolio WHERE user_id = ? AND shares > 0',
                              (current_user['id'],)).fetchall()
    recent_trades = db.execute(
        'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
        (current_user['id'],)).fetchall()
    db.close()

    holdings = []
    total_market_value = 0.0
    for h in holdings_raw:
        try:
            info = yf.Ticker(h['ticker']).info
            price = info.get('currentPrice') or info.get('regularMarketPrice') or h['avg_price']
            market_value = h['shares'] * price
            pnl = market_value - (h['shares'] * h['avg_price'])
            pnl_pct = (pnl / (h['shares'] * h['avg_price'])) * 100 if h['avg_price'] else 0
            holdings.append({'ticker': h['ticker'], 'shares': h['shares'],
                             'avg_price': h['avg_price'], 'current_price': price,
                             'market_value': market_value, 'pnl': pnl, 'pnl_pct': pnl_pct})
            total_market_value += market_value
        except Exception:
            holdings.append({'ticker': h['ticker'], 'shares': h['shares'],
                             'avg_price': h['avg_price'], 'current_price': h['avg_price'],
                             'market_value': h['shares'] * h['avg_price'], 'pnl': 0, 'pnl_pct': 0})

    total_pnl = sum(h['pnl'] for h in holdings)
    return render_template('portfolio.html', current_user=current_user, holdings=holdings,
                           recent_trades=[dict(t) for t in recent_trades],
                           total_market_value=total_market_value,
                           total_value=current_user['balance'] + total_market_value,
                           total_pnl=total_pnl)

# ─── Trading API ─────────────────────────────────────────────────────────────

@server.route('/api/buy', methods=['POST'])
def buy_stock():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    data = request.json or {}
    ticker = (data.get('ticker') or '').upper().strip()
    try:
        shares = float(data.get('shares', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid share quantity'}), 400

    if not ticker or shares <= 0:
        return jsonify({'error': 'Invalid ticker or share quantity'}), 400

    try:
        info = yf.Ticker(ticker).info
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        if not price:
            return jsonify({'error': 'Could not retrieve current price'}), 400
    except Exception:
        return jsonify({'error': 'Invalid ticker symbol'}), 400

    total_cost = round(shares * price, 4)
    user_id = session['user_id']
    db = get_db()
    user = db.execute('SELECT balance FROM users WHERE id = ?', (user_id,)).fetchone()

    if user['balance'] < total_cost:
        db.close()
        return jsonify({'error': f'Insufficient funds. Need ${total_cost:.2f}, have ${user["balance"]:.2f}'}), 400

    db.execute('UPDATE users SET balance = balance - ? WHERE id = ?', (total_cost, user_id))
    existing = db.execute('SELECT shares, avg_price FROM portfolio WHERE user_id = ? AND ticker = ?',
                          (user_id, ticker)).fetchone()
    if existing:
        new_shares = existing['shares'] + shares
        new_avg = (existing['shares'] * existing['avg_price'] + total_cost) / new_shares
        db.execute('UPDATE portfolio SET shares = ?, avg_price = ? WHERE user_id = ? AND ticker = ?',
                   (new_shares, new_avg, user_id, ticker))
    else:
        db.execute('INSERT INTO portfolio (user_id, ticker, shares, avg_price) VALUES (?, ?, ?, ?)',
                   (user_id, ticker, shares, price))

    db.execute('INSERT INTO trades (user_id, ticker, action, shares, price, total) VALUES (?,?,?,?,?,?)',
               (user_id, ticker, 'buy', shares, price, total_cost))
    db.commit()
    new_balance = db.execute('SELECT balance FROM users WHERE id = ?', (user_id,)).fetchone()['balance']
    db.close()

    return jsonify({'success': True,
                    'message': f'Bought {shares} share(s) of {ticker} at ${price:.2f}',
                    'new_balance': new_balance})

@server.route('/api/sell', methods=['POST'])
def sell_stock():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    data = request.json or {}
    ticker = (data.get('ticker') or '').upper().strip()
    try:
        shares = float(data.get('shares', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid share quantity'}), 400

    if not ticker or shares <= 0:
        return jsonify({'error': 'Invalid ticker or share quantity'}), 400

    user_id = session['user_id']
    db = get_db()
    holding = db.execute('SELECT shares FROM portfolio WHERE user_id = ? AND ticker = ?',
                         (user_id, ticker)).fetchone()
    if not holding or holding['shares'] < shares:
        db.close()
        return jsonify({'error': f'Insufficient shares. You own {holding["shares"] if holding else 0:.4f}'}), 400

    try:
        info = yf.Ticker(ticker).info
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        if not price:
            db.close()
            return jsonify({'error': 'Could not retrieve current price'}), 400
    except Exception:
        db.close()
        return jsonify({'error': 'Invalid ticker symbol'}), 400

    proceeds = round(shares * price, 4)
    new_shares = holding['shares'] - shares

    if new_shares < 0.0001:
        db.execute('DELETE FROM portfolio WHERE user_id = ? AND ticker = ?', (user_id, ticker))
    else:
        db.execute('UPDATE portfolio SET shares = ? WHERE user_id = ? AND ticker = ?',
                   (new_shares, user_id, ticker))

    db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', (proceeds, user_id))
    db.execute('INSERT INTO trades (user_id, ticker, action, shares, price, total) VALUES (?,?,?,?,?,?)',
               (user_id, ticker, 'sell', shares, price, proceeds))
    db.commit()
    new_balance = db.execute('SELECT balance FROM users WHERE id = ?', (user_id,)).fetchone()['balance']
    db.close()

    return jsonify({'success': True,
                    'message': f'Sold {shares} share(s) of {ticker} at ${price:.2f}',
                    'new_balance': new_balance})

@server.route('/api/price/<ticker>')
def get_price(ticker):
    try:
        info = yf.Ticker(ticker.upper()).info
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        if not price:
            return jsonify({'error': 'Price unavailable'}), 404
        return jsonify({'price': price, 'name': info.get('shortName', ticker.upper())})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@server.route('/api/position/<ticker>')
def get_position(ticker):
    if 'user_id' not in session:
        return jsonify({'shares': 0, 'avg_price': 0})
    db = get_db()
    holding = db.execute('SELECT shares, avg_price FROM portfolio WHERE user_id = ? AND ticker = ?',
                         (session['user_id'], ticker.upper())).fetchone()
    balance = db.execute('SELECT balance FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    db.close()
    return jsonify({'shares': holding['shares'] if holding else 0,
                    'avg_price': holding['avg_price'] if holding else 0,
                    'balance': balance['balance'] if balance else 0})

# ─── Flask Page Routes ────────────────────────────────────────────────────────

def _build_article_url(a):
    return "/article?" + urlencode({
        "title": a["title"], "link": a["link"], "image": a["image"],
        "publisher": a["publisher"], "date": a["date"], "tickers": a.get("tickers", ""),
    })

def _get_ticker_cards(tickers_str):
    if not tickers_str:
        return []
    cards = []
    for sym in tickers_str.split(","):
        sym = sym.strip()
        if not sym:
            continue
        try:
            t = yf.Ticker(sym)
            fi = t.fast_info
            price = fi.last_price
            prev = fi.previous_close
            change = round((price - prev) / prev * 100, 2) if prev else 0
            name = t.info.get("shortName", sym)
            cards.append({"ticker": sym, "name": name, "price": round(price, 2), "change": change})
        except Exception:
            cards.append({"ticker": sym, "name": sym, "price": "N/A", "change": "N/A"})
    return cards

@server.route("/", methods=["GET"])
def home():
    current_user = get_current_user()
    raw_news = get_main_news(query="Stock Market", count=8)
    home_news = [{**a, "article_url": _build_article_url(a)} for a in raw_news]
    trending_stocks = get_trending_stocks()
    return render_template("home.html", home_news=home_news, trending_stocks=trending_stocks,
                           current_user=current_user)

@server.route("/article", methods=["GET"])
def article():
    current_user = get_current_user()
    title = request.args.get("title", "")
    link = request.args.get("link", "#")
    image = request.args.get("image", "")
    publisher = request.args.get("publisher", "")
    date = request.args.get("date", "")
    tickers_str = request.args.get("tickers", "")
    related_stocks = _get_ticker_cards(tickers_str)
    related_news = get_main_news(query="Stock Market", count=5)
    related = []
    for a in related_news:
        if a["link"] != link:
            related.append({**a, "article_url": _build_article_url(a)})
    return render_template("article.html", title=title, link=link, image=image,
                           publisher=publisher, date=date, related=related[:3],
                           related_stocks=related_stocks, current_user=current_user)

@server.route("/api/fetch_article")
def fetch_article_api():
    url = request.args.get("url", "")
    if not url:
        return jsonify({"error": "No URL", "summary": "", "paragraphs": []})
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        resp = requests.get(url, headers=headers, timeout=12, allow_redirects=True)
        soup = BeautifulSoup(resp.text, "html.parser")

        summary = ""
        for attr, val in [("property", "og:description"), ("name", "description"), ("name", "twitter:description")]:
            meta = soup.find("meta", attrs={attr: val})
            if meta and meta.get("content"):
                summary = meta["content"].strip()
                break

        skip_phrases = ["cookie", "subscribe", "sign up", "newsletter", "advertisement",
                        "sign in", "log in", "already a member", "privacy policy"]

        container = (
            soup.find("article") or
            soup.find(attrs={"itemprop": "articleBody"}) or
            soup.find(class_=re.compile(r"article[_-]?body|story[_-]?body|post[_-]?content|entry[_-]?content|caas-body", re.I)) or
            soup.find("main")
        )

        paragraphs = []
        source = container if container else soup
        for p in source.find_all("p"):
            text = p.get_text(strip=True)
            if len(text) > 60 and not any(s in text.lower() for s in skip_phrases):
                paragraphs.append(text)
            if len(paragraphs) >= 15:
                break

        return jsonify({"summary": summary, "paragraphs": paragraphs})
    except Exception as e:
        return jsonify({"error": str(e), "summary": "", "paragraphs": []})

@server.route('/news.html', methods=["GET", "POST"])
def news():
    if request.method == "POST":
        query = request.form.get("query", "Stock Market")
    else:
        query = request.args.get("query", "Stock Market")
    news_articles = get_news(query, count=8)
    current_user = get_current_user()
    return render_template("news.html", news=news_articles, current_user=current_user)

@server.route('/load_more_news', methods=["GET"])
def load_more_news():
    query = request.args.get("query", "Stock Market")
    offset = int(request.args.get("offset", 0))
    return jsonify(get_news(query, count=8, offset=offset))

@server.route('/stock', methods=["GET", "POST"])
def stock():
    stock_symbol = request.args.get("stock", "^GSPC").upper()
    current_user = get_current_user()
    stock_news = get_stock_news(stock_symbol, count=5)
    ticker_news = get_latest_financial_news()
    stock_overview = get_stock_overview(stock_symbol)
    stock_about = get_stock_about(stock_symbol)
    trending_stocks = get_trending_stocks()
    related_stocks = get_related_stocks(stock_symbol)

    user_position = None
    if current_user:
        db = get_db()
        pos = db.execute('SELECT shares, avg_price FROM portfolio WHERE user_id = ? AND ticker = ?',
                         (current_user['id'], stock_symbol)).fetchone()
        db.close()
        if pos and pos['shares'] > 0:
            user_position = dict(pos)

    return render_template("stock.html", stock_symbol=stock_symbol, stock_overview=stock_overview,
                           stock_about=stock_about, trending_stocks=trending_stocks,
                           related_stocks=related_stocks, stock_news=stock_news,
                           ticker_news=ticker_news, current_user=current_user,
                           user_position=user_position)

@server.route('/autocomplete_stock', methods=["GET"])
def autocomplete_stock():
    query = request.args.get("query", "").lower()
    if not query:
        return jsonify([])
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        resp = requests.get(f"https://query1.finance.yahoo.com/v1/finance/search?q={query}", headers=headers)
        if resp.status_code == 200:
            return jsonify([{"name": s.get("shortname", s.get("symbol")), "symbol": s.get("symbol")}
                            for s in resp.json().get("quotes", [])[:10]
                            if s.get("shortname") and s.get("symbol")])
    except Exception as e:
        print(f"Autocomplete error: {e}")
    return jsonify([])

if __name__ == "__main__":
    server.run(debug=True, port=5000)
