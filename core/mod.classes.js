// Frostybot Custom Classes

md5 = require ('md5');
const { v4: uuidv4 } = require('uuid');
var context = require('express-http-context');

// The base class (All Frostybot classes are derived from this)
class frostybot_base {
  constructor () {}
}


// Account Balance Object

class frostybot_balance extends frostybot_base {
  constructor (currency, price, free, used, total) {
    super ();
    this.currency = currency;
    this.price = price;
    this.base = {
      free: free,
      used: used,
      total: total,
    };
    this.usd = {
      free: free * price,
      used: used * price,
      total: total * price,
    };
  }
}

// Market Object

class frostybot_market extends frostybot_base {
  constructor (
    id, symbol, type, base, quote, bid, ask, expiration, contract_size, precision, tvsymbol, raw) {
    super ();
    this.id = id;
    this.symbol = symbol;
    this.tvsymbol = tvsymbol;
    this.type = type;
    this.base = base;
    this.quote = quote;
    this.bid = bid;
    this.ask = ask;
    this.usd = null;
    this.avg = bid != null && ask != null ? (bid + ask) / 2 : null;
    this.expiration = expiration;
    this.contract_size = contract_size;
    this.precision = precision;
    //this.raw = raw;
  }
}

// Position Base Object

class frostybot_position extends frostybot_base {

  constructor (market, direction, base_size, quote_size, price, raw = null) {
    super ();
    var usdbase = market.usd.hasOwnProperty ('base') ? market.usd.base : market.usd;
    var usdquote = market.usd.hasOwnProperty ('quote') ? market.usd.quote : market.usd;
    //this.raw = raw;

    this.symbol = market.symbol;
    this.type = market.type;
    this.direction = direction;

    var sizing = base_size == null ? 'quote' : quote_size == null ? 'base' : 'unknown';
    switch (sizing) {
      case 'base':
        this.base_size = Math.abs(base_size);
        this.quote_size = Math.abs(this.base_size * price);
        this.usd_size = Math.abs(this.base_size * usdbase);
        break;
      case 'quote':
        this.base_size = Math.abs(quote_size / price);
        this.quote_size = Math.abs(quote_size);
        this.usd_size = Math.abs(this.base_size * usdquote);
        break;
    }
  }

}

// Futures Position Object

class frostybot_position_futures extends frostybot_position {

  constructor (market, direction, base_size, quote_size, entry_price, liquidation_price, raw = null) {
    super (market, direction, base_size, quote_size, entry_price, raw);
    this.entry_price = entry_price;
    this.entry_value = Math.abs(this.base_size * this.entry_price);
    this.current_price = market.avg != null ? market.avg : (market.bid + market.ask) / 2;
    this.current_value = Math.abs(this.base_size * this.current_price);
    this.liquidation_price = liquidation_price;
    this.pnl = (this.direction == "short" ? -1 : 1) * (this.current_value - this.entry_value); // Calculate PNL is not supplied by exchange
  }

}

// Spot Position Object

class frostybot_position_spot extends frostybot_position {

  constructor (market, direction, base_size, quote_size, raw = null) {
    super (market, direction, base_size, quote_size, market.avg, raw);
  }

}

// Order Object

class frostybot_order extends frostybot_base {
  constructor (market, id, timestamp, type, direction, price, trigger, size_base, size_quote, filled_base, filled_quote, status, raw = null) {
    super ();
    this.symbol = market.symbol;
    this.id = id;
    if (timestamp.length < 13) {
      // Convert epoch timestamp to millisecond timestamp
      timestamp = timestamp * 100;
    }
    let dateobj = new Date (timestamp);
    /*
            let day = ("0" + dateobj.getDate()).slice(-2);
            let month = ("0" + (dateobj.getMonth() + 1)).slice(-2);
            let year = dateobj.getFullYear();
            let hour = dateobj.getHours();
            let minute = dateobj.getMinutes();
            let second = dateobj.getSeconds();
            this.datetime = year + "-" + month + "-" + day + " " + hour + ":" + minute + ":" + second;
        */
    this.timestamp = timestamp;
    this.datetime = dateobj;
    this.type = type;
    this.direction = direction;
    this.price = price;
    this.trigger = trigger;
    this.size_base = size_base;
    this.size_quote = size_quote;
    this.filled_base = filled_base;
    this.filled_quote = filled_quote;
    this.status = status;
    //this.raw = raw;
  }
}

// Output Object

class frostybot_output extends frostybot_base {
  constructor (command, params, result, message, type, data, stats, messages) {
    super ();
    this.command = command;
    this.params = params != null
      ? helper.censorProps (params, ['apikey', 'secret', 'password', 'oldpassword', 'newpassword'])
      : undefined;
    this.result = result;
    this.message = message;
    this.type = type;
    this.data = data;
    this.stats = stats;
    this.messages = messages;
    if (message == null) delete this.message;
  }
}

// Performance Metric

class frostybot_metric extends frostybot_base {

  constructor(metric) {
    super ();
    this.context = context.get('reqId');
    this.metric = metric;
    this.uuid = uuidv4();
    this.cached = false;
  }

  start() {
    this.start_time = (new Date).getTime();
  }

  end() {
    this.end_time = (new Date).getTime();
    this.duration = (this.end_time - this.start_time) / 1000;
  }

}

// Frostybot Exchange Handler

class frostybot_exchange extends frostybot_base {

    // Constructor

    constructor (stub) {
      super ();
      this.stub = stub;
      this.exchanges = {};
      this.exhandler = null;
      this.load_modules();
      this.load_handler(stub);
    }

    // Create module shortcuts

    load_modules () {
      Object.keys (global.frostybot._modules_).forEach (module => {
        if (!['core', 'classes'].includes (module)) {
          this[module] = global.frostybot._modules_[module];
        }
      });
    }

    // Load exchange handler for stub

    async load_handler (stub) {
      this.load_modules ();
      //this['accounts'] = global.frostybot._modules_['accounts'];
      if (stub == undefined) {
        stub = context.get('stub');
      }
      this.exhandler = null;
      var account = await this.accounts.getaccount (stub);
      if (account) {
        account = this.utils.lower_props (account);
        if (account && account.hasOwnProperty (stub)) {
          account = account[stub];
        }
        const exchange_id = (account.hasOwnProperty('exchange') ? account.exchange : undefined);
        if (exchange_id == undefined) {
          //return this.output.error('account_retrieve', 'Undefined stub')
          return false;
        }
        this.exchange_id = exchange_id;
        var type = account.hasOwnProperty ('type') ? account.type : null;
        this.exchanges[exchange_id] = require ('../exchanges/exchange.' + exchange_id + (type != null ? '.' + type : ''));
        const exchange_class = this.exchanges[exchange_id];
        this.exhandler = new exchange_class (stub);
        if (this.exhandler.hasOwnProperty('ccxtparams')) {
          
        }
        this.exhandler.interfaces.methods.forEach(method => this.load_method(method));
      }
    }

    // Load Method

    load_method(method) {
      this[method] =  async (params) => {return await this.execute (method, params);}
    }

    // Normalizer and CCXT Execution Handler

    async execute (method, params = []) {
      if (this.exhandler == undefined) await this.load_handler (params == undefined ? this.stub : params.stub);
      if (this.exhandler != undefined) {
          return await this.exhandler.execute (method, params);
      }
      return false;
    }

    // Get Exchange property

    get (property) {
      return this.exhandler[property];
    }

}


// Frostybot Websocket Ticker

class frostybot_websocket_ticker extends frostybot_base {
  constructor (exchange, stub, timestamp, symbol, bid, ask) {
    super ();
    this.message_type = 'ticker';
    this.exchange = exchange;
    this.stub = stub;
    this.timestamp = timestamp;
    this.datetime = new Date (timestamp).toJSON ();
    this.symbol = symbol;
    this.bid = bid;
    this.ask = ask;
  }
}

// Frostybot Websocket Trade

class frostybot_websocket_trade extends frostybot_base {
  constructor (exchange, stub, timestamp, symbol, side, base, quote, price) {
    super ();
    this.message_type = 'trade';
    this.exchange = exchange;
    this.stub = stub;
    this.timestamp = timestamp;
    this.datetime = new Date (timestamp).toJSON ();
    this.symbol = symbol;
    this.side = side;
    this.base = base;
    this.quote = quote;
    this.price = price;
  }
}

// Frostybot Websocket Order

class frostybot_websocket_order extends frostybot_base {
  constructor (
    exchange,
    stub,
    symbol,
    id,
    timestamp,
    type,
    direction,
    price,
    trigger,
    size_base,
    size_quote,
    filled_base,
    filled_quote,
    status,
    raw = null
  ) {
    super ();
    this.message_type = 'order';
    this.exchange = exchange;
    this.stub = stub;
    this.symbol = symbol;
    this.id = id;
    this.timestamp = timestamp;
    this.datetime = new Date (timestamp).toJSON ();
    this.type = type;
    this.direction = direction;
    this.price = price;
    this.trigger = trigger;
    this.size_base = size_base;
    this.size_quote = size_quote;
    this.filled_base = filled_base;
    this.filled_quote = filled_quote;
    this.status = status;
    this.raw = raw;
  }
}

module.exports = {
  balance: frostybot_balance,
  position_futures: frostybot_position_futures,
  position_spot: frostybot_position_spot,
  market: frostybot_market,
  order: frostybot_order,
  metric: frostybot_metric,
  output: frostybot_output,
  exchange: frostybot_exchange,
  websocket_trade: frostybot_websocket_trade,
  websocket_ticker: frostybot_websocket_ticker,
  websocket_order: frostybot_websocket_order,
};
