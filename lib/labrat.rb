class LabRat

  attr_reader :logger, :options, :config
  attr_reader :telegram, :twitter_sync

  autoload :Bootstrap,    'labrat/bootstrap'
  autoload :Util,         'labrat/util'
  autoload :WebInterface, 'labrat/web_interface'
  autoload :Telegram,     'labrat/telegram'
  autoload :TwitterSync,  'labrat/twitter_sync'
  autoload :NyaaCatFeed,  'labrat/nyaa_cat_feed'

  include Bootstrap

end
