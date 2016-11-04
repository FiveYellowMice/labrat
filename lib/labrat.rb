class LabRat

  attr_reader :logger, :options, :config, :telegram

  autoload :Bootstrap, 'labrat/bootstrap'
  autoload :Util,      'labrat/util'
  autoload :Telegram,  'labrat/telegram'

  include Bootstrap

end
