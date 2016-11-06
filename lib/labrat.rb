class LabRat

  attr_reader :logger, :options, :config
  attr_reader :telegram, :twitter_sync

  autoload :Bootstrap,   'labrat/bootstrap'
  autoload :Util,        'labrat/util'
  autoload :Telegram,    'labrat/telegram'
  autoload :TwitterSync, 'labrat/twitter_sync'

  include Bootstrap

end
