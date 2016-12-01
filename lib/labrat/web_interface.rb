# frozen_string_literal: true

require 'thin'
require 'rack'

##
# HTTP server.

class LabRat::WebInterface


  include LabRat::Util


  def initialize(bot)
    setup_instance_variables(bot)

    @static_server = Rack::Static.new(nil, urls: [''], root: @options.data_dir)

    Thread.new do
      Thin::Logging.silent = true
      @server = Thin::Server.new(@config.web_interface.address, @config.web_interface.port, self, signals: false)
      at_exit do
        @server.stop!
      end
      @server.start
    end
  end


  ##
  # Starting point of an HTTP request.

  def call(rack_env)
    if rack_env['PATH_INFO'] == "#{@config.web_interface.baseurl}/nyaa_cat_feed_minecraft_tag.xml"
      rack_env['SCRIPT_NAME'] = @config.web_interface.baseurl
      rack_env['PATH_INFO'] = rack_env['PATH_INFO'][@config.web_interface.baseurl.length..-1]
      return @static_server.call(rack_env)
    end
    [404, { 'Content-Type' => 'text/plain; charset=UTF-8', 'Cache-Control' => 'no-cache' }, ["Not found.\n\u{1f31a}\n"]]
  end


end
